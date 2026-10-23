import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { isErrorResponse, requireUser, UUID_RE } from "@/lib/auth";
import { buildBrandPrompt, BRAND_ASSET_SPECS, type BrandAssetType } from "@/lib/openai/brand-prompts";
import { generateCharacterImage, IMAGE_MODEL } from "@/lib/openai/generate-character-image";
import { mapGenerationError, statusForGenerationError } from "@/lib/openai/map-error";
import { downloadFromStorage, imagePath, removeFromStorage, signOnePath, uploadImage } from "@/lib/storage";
import { logGeneration, USER_MAX_GENERATIONS_PER_WINDOW } from "@/lib/generation-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_IMAGES_PER_CHARACTER = 60; // mirrors the database trigger (migration 002)

const bodySchema = z.object({
  type: z.enum(["logo", "pfp", "banner", "sticker", "meme"]),
  prompt: z.string().trim().max(500).default(""),
});

/**
 * Generate a Memecoin Branding Studio asset (logo / pfp / banner / sticker /
 * reaction meme) for an already-SAVED character. Always generated FROM the
 * character's own reference image, so every asset keeps the same visual
 * identity — this is the same character-consistency mechanism the scenes
 * feature uses, applied to marketing assets instead of story scenes.
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
    return NextResponse.json({ error: "That request looked malformed.", code: "BAD_REQUEST" }, { status: 400 });
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
    .from("characters").select("id, name, style, cover_image_id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!character) return NextResponse.json({ error: "Character not found." }, { status: 404 });

  const { count } = await supabase.from("character_images").select("id", { count: "exact", head: true }).eq("character_id", id);
  if ((count ?? 0) >= MAX_IMAGES_PER_CHARACTER) {
    return NextResponse.json({ error: `This character already has ${MAX_IMAGES_PER_CHARACTER} images. Delete some to make room.`, code: "LIMIT_REACHED" }, { status: 409 });
  }

  let referencePath: string | undefined;
  if (character.cover_image_id) {
    const { data } = await supabase.from("character_images").select("storage_path").eq("id", character.cover_image_id).maybeSingle();
    referencePath = data?.storage_path;
  }
  if (!referencePath) {
    const { data } = await supabase
      .from("character_images").select("storage_path").eq("character_id", id).eq("kind", "original").limit(1).maybeSingle();
    referencePath = data?.storage_path;
  }
  if (!referencePath) {
    return NextResponse.json({ error: "This character has no image to brand from.", code: "NO_REFERENCE" }, { status: 409 });
  }

  const type = body.type as BrandAssetType;
  const spec = BRAND_ASSET_SPECS[type];
  const logBase = { userId: user.id, characterId: id, mode: "new_scene" as const, style: character.style, prompt: `[brand:${type}] ${body.prompt}`, model: IMAGE_MODEL };

  let generated;
  try {
    const reference = await downloadFromStorage(referencePath);
    generated = await generateCharacterImage({
      referenceImages: [{ buffer: reference, mimeType: "image/png" }],
      prompt: buildBrandPrompt({ type, characterName: character.name, style: character.style, userPrompt: body.prompt }),
      aspectRatio: spec.aspectRatio,
      background: spec.background,
      outputFormat: spec.outputFormat,
    });
  } catch (err) {
    const mapped = mapGenerationError(err);
    void logGeneration({ ...logBase, status: "error", errorCode: mapped.code });
    return NextResponse.json(mapped, { status: statusForGenerationError(err) });
  }

  const imageBytes = Buffer.from(generated.imageBase64, "base64");
  const imageId = randomUUID();
  const path = imagePath(user.id, id, imageId, spec.outputFormat);

  try {
    await uploadImage(path, imageBytes, spec.outputFormat);
  } catch (err) {
    console.error("[LoreForge] Brand asset: upload failed:", err);
    return NextResponse.json({ error: "The asset was generated but couldn't be stored. Please try again.", code: "STORAGE_ERROR" }, { status: 502 });
  }

  const { error } = await supabase.from("character_images").insert({
    id: imageId,
    character_id: id,
    owner_id: user.id,
    storage_path: path,
    kind: type,
    scene_prompt: body.prompt || null,
    aspect_ratio: spec.aspectRatio,
    model: IMAGE_MODEL,
    file_ext: spec.outputFormat,
  });
  if (error) {
    await removeFromStorage([path]);
    console.error("[LoreForge] Brand asset: image row insert failed:", error.message);
    const limit = error.message.includes("image_limit_reached");
    return NextResponse.json(
      { error: limit ? "This character has reached its image limit." : "Couldn't save the asset.", code: limit ? "LIMIT_REACHED" : "DB_ERROR" },
      { status: limit ? 409 : 500 }
    );
  }

  void logGeneration({ ...logBase, status: "success" });
  const mime = spec.outputFormat === "webp" ? "image/webp" : "image/png";
  // Signed URL, not inline base64 — keeps the response body small regardless
  // of asset size (banners especially can be large), important on hosts
  // with response-body size caps.
  const extLabel = spec.outputFormat === "webp" ? "webp" : "png";
  const [viewUrl, downloadUrl] = await Promise.all([
    signOnePath(path),
    signOnePath(path, { download: `loreforge-${type}.${extLabel}` }),
  ]);
  const dataUrl = `data:${mime};base64,${generated.imageBase64}`;

  return NextResponse.json({
    imageUrl: viewUrl ?? dataUrl,
    downloadUrl: downloadUrl ?? dataUrl,
    imageId,
    type,
    label: spec.label,
  });
}
