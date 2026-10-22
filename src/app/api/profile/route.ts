import { NextResponse } from "next/server";
import { z } from "zod";
import { isErrorResponse, requireUser } from "@/lib/auth";

export const runtime = "nodejs";

const RESERVED = new Set(["admin", "administrator", "support", "loreforge", "root", "system", "moderator", "official"]);

const schema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,24}$/, "Usernames are 3–24 characters: letters, numbers and underscores.")
      .refine((u) => !RESERVED.has(u), "That username is reserved.")
      .optional(),
    displayName: z.string().trim().min(1).max(50).optional(),
  })
  .refine((v) => v.username !== undefined || v.displayName !== undefined, { message: "Nothing to update." });

export async function PATCH(req: Request) {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth;
  const { supabase, user } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid profile.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const patch: Record<string, string> = {};
  if (parsed.data.username) patch.username = parsed.data.username;
  if (parsed.data.displayName) patch.display_name = parsed.data.displayName;

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That username is taken.", code: "USERNAME_TAKEN" }, { status: 409 });
    console.error("[LoreForge] Profile update failed:", error.message);
    return NextResponse.json({ error: "Couldn't update your profile.", code: "DB_ERROR" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
