import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { isErrorResponse, requireUser, UUID_RE } from "@/lib/auth";
import { buildScenePrompt } from "@/lib/openai/build-prompt";
import { generateCharacterImage, IMAGE_MODEL } from "@/lib/openai/generate-character-image";
import { mapGenerationError, statusForGenerationError } from "@/lib/openai/map-error";
import { downloadFromStorage, imagePath, removeFromStorage, signOnePath, uploadPng } from "@/lib/storage";
import { logGeneration, USER_MAX_GENERATIONS_PER_WINDOW } from "@/lib/generation-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { ART_STYLE_VALUES, ASPECT_RATIO_VALUES } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGES_PER_CHARACTER = 60; // mirrors the database trigger (migration 002); checked first so we don't pay for a doomed generation

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  aspectRatio: z.enum(ASPECT_RATIO_VALUES),
  style: z.enum(ART_STYLE_VALUES).optional(),
});

/**
 * Generate a new scene for an already-SAVED character.
 *
 * The reference image is loaded from private Storage on the server, using the
 * character's cover image. Ownership is verified through the user's own
 * RLS-enforced client, so nobody can use another person's private character
 * as a reference. The result is persisted automatically.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY isn't configured on the server.", code: "MISSING_API_KEY" }, { status: 501 });
  }
  const auth = await requireUser({ needsServiceRole: true });
  if (isErrorResponse(auth)) return auth;
  const { supabase, user } = auth;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Character not found." }, { status: 404 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Describe the scene you want (up to 2000 characters).", code: "BAD_REQUEST" }, { status: 400 });
  }

  let rate;
  try {
    rate = await checkRateLimitAsync(`generation:user:${user.id}`, USER_MAX_GENERATIONS_PER_WINDOW);
  } catch {
    return NextResponse.json({ error: "Request protection is temporarily unavailable. Please try again shortly.", code: "RATE_LIMIT_UNAVAILABLE" }, { status: 503 });
  }
  if (!rate.allowed) {
    return NextResponse.json({ error: `You've hit the generation limit for now. Try again in about ${rate.retryAfterSeconds ?? 600}s.`, code: "RATE_LIMITED" }, { status: 429 });
  }

  const { data: character } = await supabase
    .from("characters").select("id, style, cover_image_id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!character) return NextResponse.json({ error: "Character not found." }, { status: 404 });

  const { count } = await supabase
    .from("character_images").select("id", { count: "exact", head: true }).eq("character_id", id);
  if ((count ?? 0) >= MAX_IMAGES_PER_CHARACTER) {
    return NextResponse.json({ error: `This character already has ${MAX_IMAGES_PER_CHARACTER} images. Delete the character or start a new one.`, code: "LIMIT_REACHED" }, { status: 409 });
  }

  // Reference = the cover image (the character's canonical look), else the oldest image.
  let referencePath: string | undefined;
  if (character.cover_image_id) {
    const { data } = await supabase.from("character_images").select("storage_path").eq("id", character.cover_image_id).maybeSingle();
    referencePath = data?.storage_path;
  }
  if (!referencePath) {
    const { data } = await supabase
      .from("character_images").select("storage_path").eq("character_id", id).order("created_at", { ascending: true }).limit(1).maybeSingle();
    referencePath = data?.storage_path;
  }
  if (!referencePath) {
    return NextResponse.json({ error: "This character has no image to use as a reference.", code: "NO_REFERENCE" }, { status: 409 });
  }

  const style = body.style ?? character.style;
  const logBase = { userId: user.id, characterId: id, mode: "new_scene" as const, style, prompt: body.prompt, model: IMAGE_MODEL };

  let generated;
  try {
    const reference = await downloadFromStorage(referencePath);
    generated = await generateCharacterImage({
      referenceImages: [{ buffer: reference, mimeType: "image/png" }],
      prompt: buildScenePrompt({ sceneDescription: body.prompt, style }),
      aspectRatio: body.aspectRatio,
    });
  } catch (err) {
    const mapped = mapGenerationError(err);
    void logGeneration({ ...logBase, status: "error", errorCode: mapped.code });
    return NextResponse.json(mapped, { status: statusForGenerationError(err) });
  }

  const imageBytes = Buffer.from(generated.imageBase64, "base64");
  const imageId = randomUUID();
  const path = imagePath(user.id, id, imageId);

  try {
    await uploadPng(path, imageBytes);
  } catch (err) {
    console.error("[LoreForge] Scene: upload failed:", err);
    return NextResponse.json({ error: "The scene was generated but couldn't be stored. Please try again.", code: "STORAGE_ERROR" }, { status: 502 });
  }

  const { error } = await supabase.from("character_images").insert({
    id: imageId,
    character_id: id,
    owner_id: user.id,
    storage_path: path,
    kind: "scene",
    scene_prompt: body.prompt,
    aspect_ratio: body.aspectRatio,
    model: IMAGE_MODEL,
  });
  if (error) {
    await removeFromStorage([path]);
    console.error("[LoreForge] Scene: image row insert failed:", error.message);
    const limit = error.message.includes("image_limit_reached");
    return NextResponse.json(
      { error: limit ? "This character has reached its image limit." : "Couldn't save the scene.", code: limit ? "LIMIT_REACHED" : "DB_ERROR" },
      { status: limit ? 409 : 500 }
    );
  }

  void logGeneration({ ...logBase, status: "success" });

  // Return a signed URL, not the raw base64 bytes — keeps the response body
  // small regardless of how large the generated PNG is (important on hosts
  // with response-body size caps). Falls back to inline base64 only if
  // signing somehow fails, so the UI still gets a usable image either way.
  const [viewUrl, downloadUrl] = await Promise.all([
    signOnePath(path),
    signOnePath(path, { download: "loreforge-scene.png" }),
  ]);
  const dataUrl = `data:image/png;base64,${generated.imageBase64}`;

  return NextResponse.json({
    imageUrl: viewUrl ?? dataUrl,
    downloadUrl: downloadUrl ?? dataUrl,
    imageId,
    characterId: id,
  });
}
