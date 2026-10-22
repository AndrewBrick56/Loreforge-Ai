import "server-only";
import { toFile } from "openai/uploads";
import { getOpenAIClient } from "./client";
import type { AspectRatio } from "@/types/character";

// gpt-image-1 shuts down 2026-10-23 and gpt-image-1.5 shuts down 2026-12-01
// (OpenAI deprecation notices, checked 2026-09-27) — gpt-image-2 is the
// current non-deprecated flagship, so it's the default here. Override with
// OPENAI_IMAGE_MODEL if you want to try gpt-image-2.5-flare / -sunburst.
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const IMAGE_QUALITY = (process.env.OPENAI_IMAGE_QUALITY as "low" | "medium" | "high") || "high";

/** A wide 3:1 ratio, used for X/Twitter-style banners (1500x500 is 3:1). Not one of the studio's 5 photo aspect ratios. */
export type BrandAspectRatio = AspectRatio | "3:1";

/**
 * Maps supported aspect ratios to WIDTHxHEIGHT strings. gpt-image-2 supports
 * arbitrary sizes as long as both dimensions are divisible by 16 and the
 * aspect ratio is between 1:3 and 3:1 — all of these land comfortably within
 * that range.
 */
function resolveSize(aspectRatio: BrandAspectRatio): string {
  switch (aspectRatio) {
    case "1:1":
      return "1024x1024";
    case "3:4":
      return "1024x1360";
    case "4:3":
      return "1360x1024";
    case "9:16":
      return "1024x1824";
    case "16:9":
      return "1824x1024";
    case "3:1":
      return "1536x512";
  }
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

export interface GenerateCharacterImageParams {
  referenceImages: { buffer: Buffer; mimeType: string }[];
  prompt: string;
  aspectRatio: BrandAspectRatio;
  /** "transparent" for logos/stickers meant to sit on top of other backgrounds. Defaults to "auto". */
  background?: "transparent" | "opaque" | "auto";
  /** webp for Telegram stickers (their native format); defaults to png. */
  outputFormat?: "png" | "webp";
}

export interface GenerateCharacterImageResult {
  imageBase64: string;
  revisedPrompt?: string;
}

/**
 * Calls OpenAI's images.edit endpoint with one or more reference images.
 * A single reference image is the normal "create a character" case. Passing
 * more than one is what character-consistency / multi-reference branding
 * work (e.g. logo derived from the character + a wordmark reference) can use
 * this for later.
 */
export async function generateCharacterImage({
  referenceImages,
  prompt,
  aspectRatio,
  background = "auto",
  outputFormat = "png",
}: GenerateCharacterImageParams): Promise<GenerateCharacterImageResult> {
  const files = await Promise.all(
    referenceImages.map(({ buffer, mimeType }, i) =>
      toFile(buffer, `reference-${i}.${extensionForMimeType(mimeType)}`, { type: mimeType })
    )
  );

  const result = await getOpenAIClient().images.edit({
    model: IMAGE_MODEL,
    image: files.length === 1 ? files[0] : files,
    prompt,
    size: resolveSize(aspectRatio),
    quality: IMAGE_QUALITY,
    background,
    output_format: outputFormat,
  });

  const first = result.data?.[0];
  if (!first?.b64_json) {
    throw new Error("The generation model did not return an image.");
  }

  return {
    imageBase64: first.b64_json,
    revisedPrompt: first.revised_prompt ?? undefined,
  };
}
