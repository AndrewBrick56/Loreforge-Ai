import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { buildGenerationPrompt, buildScenePrompt } from "@/lib/openai/build-prompt";
import { generateCharacterImage, IMAGE_MODEL } from "@/lib/openai/generate-character-image";
import { checkRateLimitAsync, getClientKey } from "@/lib/rate-limit";
import { mapGenerationError, statusForGenerationError } from "@/lib/openai/map-error";
import { sniffImageType } from "@/lib/validate-image";
import { signImage } from "@/lib/generation-token";
import { getServerUser } from "@/lib/auth";
import { hasServiceRole } from "@/lib/supabase/server";
import { downloadFromStorage, pendingImagePath, signOnePath, uploadImage } from "@/lib/storage";
import {
  logGeneration,
  USER_MAX_GENERATIONS_PER_WINDOW,
} from "@/lib/generation-log";

export const runtime = "nodejs";
export const maxDuration = 300;

// Deliberately well under hosting platforms' serverless request-body caps
// (e.g. Vercel's 4.5MB limit on both request AND response bodies). Base64
// encoding inflates raw bytes by ~33%, so 3MB raw becomes ~4MB as base64 —
// safe with headroom once the rest of the JSON payload is added. See the
// README's "Deployment notes" section for the full reasoning.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_GENERATED_REFERENCE_BYTES = 12 * 1024 * 1024; // sanity bound for our own stored output only

const artStyleValues = [
  "3d_animation",
  "cartoon",
  "anime",
  "cyberpunk",
  "internet_meme",
  "comic_book",
  "fantasy",
  "clay_animation",
  "video_game",
] as const;

const aspectRatioValues = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;
const PENDING_PATH_RE = /^pending\/[0-9a-f-]{36}\.png$/;

/**
 * Two modes:
 * - "new_character" (default): a fresh photo upload becomes a brand-new character.
 * - "new_scene": uses a previously generated character image as the
 *   reference, and the prompt describes a new scene/pose/outfit for that
 *   character. The reference is provided EITHER as `referencePendingImagePath`
 *   (preferred — the previous generation's Storage draft, downloaded
 *   server-side, no bytes in this request) OR `referenceImageBase64`
 *   (fallback, for when Storage wasn't configured at the time the previous
 *   image was generated).
 *
 * (Scenes for an already-SAVED character go through
 *  /api/characters/[id]/scenes instead, which loads the reference server-side.)
 */
const requestSchema = z
  .object({
    mode: z.enum(["new_character", "new_scene"]).optional().default("new_character"),
    imageBase64: z.string().optional(),
    referenceImageBase64: z.string().optional(),
    referencePendingImagePath: z.string().regex(PENDING_PATH_RE).optional(),
    prompt: z.string().max(2000),
    style: z.enum(artStyleValues),
    aspectRatio: z.enum(aspectRatioValues),
    autoDirection: z.boolean().optional().default(false),
  })
  .refine((v) => (v.mode === "new_character" ? Boolean(v.imageBase64) : true), {
    message: "imageBase64 is required for mode 'new_character'.",
  })
  .refine((v) => (v.mode === "new_scene" ? Boolean(v.referenceImageBase64 || v.referencePendingImagePath) : true), {
    message: "A reference image is required for mode 'new_scene'.",
  });

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY isn't configured on the server. Add it to .env.local and restart the dev server.",
        code: "MISSING_API_KEY",
      },
      { status: 501 }
    );
  }

  // Reserve the quota before an expensive model call. Unlike counting history
  // rows written after generation, this is atomic across concurrent instances.
  const { user } = await getServerUser().catch(() => ({ user: null }));
  let rate;
  try {
    const key = user && hasServiceRole() ? `generation:user:${user.id}` : `generation:ip:${getClientKey(req)}`;
    rate = await checkRateLimitAsync(key, USER_MAX_GENERATIONS_PER_WINDOW);
  } catch {
    return NextResponse.json({ error: "Request protection is temporarily unavailable. Please try again shortly.", code: "RATE_LIMIT_UNAVAILABLE" }, { status: 503 });
  }
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `You've hit the generation limit for now. Try again in about ${rate.retryAfterSeconds ?? 600}s.`, code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "That request looked malformed — try re-uploading your photo.", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  if (!parsed.prompt.trim() && !parsed.autoDirection) {
    return NextResponse.json(
      { error: "Describe your character, or turn on auto creative direction.", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  let buffer: Buffer;
  // Anything the *client* sent is held to the strict upload cap. A reference
  // pulled from our own Storage is a PNG this server generated earlier, so it
  // only gets a more generous sanity bound (generated images can exceed 3MB).
  let maxBytes = MAX_IMAGE_BYTES;
  if (parsed.mode === "new_scene" && parsed.referencePendingImagePath) {
    try {
      buffer = await downloadFromStorage(parsed.referencePendingImagePath);
      maxBytes = MAX_GENERATED_REFERENCE_BYTES;
    } catch {
      return NextResponse.json(
        { error: "That reference image has expired. Please generate the character again.", code: "PENDING_NOT_FOUND" },
        { status: 400 }
      );
    }
  } else {
    const sourceBase64 = parsed.mode === "new_scene" ? parsed.referenceImageBase64! : parsed.imageBase64!;
    buffer = Buffer.from(sourceBase64, "base64");
  }

  if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) {
    return NextResponse.json(
      { error: "Image must be a valid file under 3MB. Larger phone photos usually have a 'smaller size' share option — try that.", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  // Identify the file by its real bytes; never trust a client-declared type.
  const sourceMimeType = sniffImageType(buffer);
  if (!sourceMimeType) {
    return NextResponse.json(
      { error: "That file isn't a valid PNG, JPEG or WebP image.", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const prompt =
    parsed.mode === "new_scene"
      ? buildScenePrompt({ sceneDescription: parsed.prompt.trim(), style: parsed.style })
      : buildGenerationPrompt({
          description: parsed.prompt.trim(),
          style: parsed.style,
          autoDirection: parsed.autoDirection,
        });

  const logBase = {
    mode: parsed.mode,
    style: parsed.style,
    prompt: parsed.prompt.trim() || "[auto creative direction]",
    model: IMAGE_MODEL,
  } as const;

  try {
    const result = await generateCharacterImage({
      referenceImages: [{ buffer, mimeType: sourceMimeType }],
      prompt,
      aspectRatio: parsed.aspectRatio,
    });

    const imageBytes = Buffer.from(result.imageBase64, "base64");
    if (user && hasServiceRole()) void logGeneration({ userId: user.id, ...logBase, status: "success" });
    // Proof this server produced these exact bytes; verified again at save time.
    const imageToken = signImage(imageBytes);

    // Prefer storing the result in Supabase Storage and returning a signed
    // URL: this keeps the response body tiny (a URL string, not a multi-MB
    // base64 blob), which matters a lot on serverless hosts with response
    // body size caps. Falls back to the original inline-base64 response
    // when Storage isn't configured, so local dev without Supabase set up
    // still works exactly as before.
    if (hasServiceRole()) {
      try {
        const pendingPath = pendingImagePath(randomUUID());
        await uploadImage(pendingPath, imageBytes, "png");
        const [viewUrl, downloadUrl] = await Promise.all([
          signOnePath(pendingPath),
          signOnePath(pendingPath, { download: "loreforge-character.png" }),
        ]);
        if (viewUrl) {
          return NextResponse.json({
            imageUrl: viewUrl,
            downloadUrl: downloadUrl ?? viewUrl,
            pendingImagePath: pendingPath,
            imageToken,
            revisedPrompt: result.revisedPrompt,
          });
        }
        // Signing failed for some reason — fall through to inline base64
        // below rather than losing a successful (and costly) generation.
      } catch (storageErr) {
        console.error("[LoreForge] Pending-image storage failed, falling back to inline response:", storageErr);
      }
    }

    const dataUrl = `data:image/png;base64,${result.imageBase64}`;
    return NextResponse.json({
      imageUrl: dataUrl,
      downloadUrl: dataUrl,
      pendingImagePath: null,
      imageToken,
      revisedPrompt: result.revisedPrompt,
    });
  } catch (err) {
    const mapped = mapGenerationError(err);
    if (user && hasServiceRole()) {
      void logGeneration({ userId: user.id, ...logBase, status: "error", errorCode: mapped.code });
    }
    return NextResponse.json(mapped, { status: statusForGenerationError(err) });
  }
}
