import { NextResponse } from "next/server";
import { z } from "zod";
import { isErrorResponse, requireUser, UUID_RE } from "@/lib/auth";
import { loreSchema } from "@/lib/schemas";
import { removeFromStorage } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    isPublic: z.boolean().optional(),
    lore: loreSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.isPublic !== undefined || v.lore !== undefined, {
    message: "Nothing to update.",
  });

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth;
  const { supabase, user } = auth;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Those changes looked invalid.", code: "BAD_REQUEST" }, { status: 400 });
  }

  // Ownership check first. RLS would also block a foreign update, but an
  // explicit check gives a clean 404 instead of a silent no-op.
  const { data: own } = await supabase
    .from("characters").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!own) return NextResponse.json({ error: "Character not found." }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.isPublic !== undefined) patch.is_public = body.isPublic;

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("characters").update(patch).eq("id", id).eq("owner_id", user.id);
    if (error) {
      console.error("[LoreForge] Character update failed:", error.message);
      return NextResponse.json({ error: "Couldn't update the character.", code: "DB_ERROR" }, { status: 500 });
    }
  }

  if (body.lore) {
    const { error } = await supabase.from("character_profiles").upsert(
      {
        character_id: id,
        title: body.lore.title,
        personality: body.lore.personality,
        catchphrase: body.lore.catchphrase,
        origin_story: body.lore.originStory,
        likes: body.lore.likes,
        dislikes: body.lore.dislikes,
      },
      { onConflict: "character_id" }
    );
    if (error) {
      console.error("[LoreForge] Lore upsert failed:", error.message);
      return NextResponse.json({ error: "Couldn't save the profile.", code: "DB_ERROR" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireUser({ needsServiceRole: true });
  if (isErrorResponse(auth)) return auth;
  const { supabase, user } = auth;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: images, error: imagesError } = await supabase
    .from("character_images").select("storage_path").eq("character_id", id).eq("owner_id", user.id);
  if (imagesError) {
    console.error("[LoreForge] Character image lookup before delete failed:", imagesError.message);
    return NextResponse.json({ error: "Couldn't prepare the character for deletion.", code: "DB_ERROR" }, { status: 500 });
  }

  const paths = [...new Set((images ?? []).map((r: { storage_path: string }) => r.storage_path).filter(Boolean))];

  // Persist every path before the database rows cascade away. If Storage
  // removal later fails, the cron job still has a durable record to retry.
  // The cron also verifies a path is no longer referenced before deleting it,
  // so a failed character DELETE cannot make a live image disappear.
  if (paths.length > 0) {
    const { error: queueError } = await createAdminClient()
      .from("storage_cleanup_jobs")
      .upsert(paths.map((storage_path) => ({ storage_path })), { onConflict: "storage_path", ignoreDuplicates: true });
    if (queueError) {
      console.error("[LoreForge] Could not queue character image cleanup:", queueError.message);
      return NextResponse.json({ error: "Cleanup protection is unavailable; the character was not deleted.", code: "CLEANUP_UNAVAILABLE" }, { status: 503 });
    }
  }

  const { data: deleted, error } = await supabase
    .from("characters").delete().eq("id", id).eq("owner_id", user.id).select("id");
  if (error) {
    console.error("[LoreForge] Character delete failed:", error.message);
    return NextResponse.json({ error: "Couldn't delete the character.", code: "DB_ERROR" }, { status: 500 });
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: "Character not found." }, { status: 404 });
  }

  const cleanup = await removeFromStorage(paths);
  if (!cleanup.ok) {
    console.error("[LoreForge] Character deleted; storage cleanup queued for", cleanup.failedPaths.length, "object(s).");
    return NextResponse.json({ ok: true, storageCleanupPending: true }, { status: 200 });
  }

  if (paths.length > 0) {
    const { error: queueDeleteError } = await createAdminClient()
      .from("storage_cleanup_jobs").delete().in("storage_path", paths);
    if (queueDeleteError) {
      // The objects are already gone. Leaving queue rows is safe: the cron
      // retries idempotently and removes the queue entries after confirming
      // there are no database references.
      console.error("[LoreForge] Removed images but couldn't clear cleanup queue:", queueDeleteError.message);
      return NextResponse.json({ ok: true, storageCleanupPending: true }, { status: 200 });
    }
  }
  return NextResponse.json({ ok: true, storageCleanupPending: false });
}
