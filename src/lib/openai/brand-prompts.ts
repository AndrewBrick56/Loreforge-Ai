import type { ArtStyle } from "@/types/character";
import { STYLE_PROMPT_FRAGMENTS } from "./style-prompts";
import type { BrandAspectRatio } from "./generate-character-image";

export type BrandAssetType = "logo" | "pfp" | "banner" | "sticker" | "meme";

export interface BrandAssetSpec {
  aspectRatio: BrandAspectRatio;
  background: "transparent" | "opaque" | "auto";
  outputFormat: "png" | "webp";
  /** Shown in the UI so people know what they're about to generate matches a real platform spec. */
  label: string;
}

export const BRAND_ASSET_SPECS: Record<BrandAssetType, BrandAssetSpec> = {
  logo: { aspectRatio: "1:1", background: "transparent", outputFormat: "png", label: "Square token logo, transparent background" },
  pfp: { aspectRatio: "1:1", background: "opaque", outputFormat: "png", label: "X (Twitter) profile picture, 1:1" },
  banner: { aspectRatio: "3:1", background: "opaque", outputFormat: "png", label: "X (Twitter) header banner, 3:1" },
  sticker: { aspectRatio: "1:1", background: "transparent", outputFormat: "webp", label: "Telegram sticker, 512×512 WebP, transparent" },
  meme: { aspectRatio: "1:1", background: "opaque", outputFormat: "png", label: "Reaction meme pose" },
};

interface BuildBrandPromptArgs {
  type: BrandAssetType;
  characterName: string;
  style: ArtStyle;
  userPrompt: string;
}

/**
 * Every brand asset is generated FROM the character's existing reference
 * image (character consistency), never from scratch, so the coin's whole
 * visual kit actually looks like the same character.
 */
export function buildBrandPrompt({ type, characterName, style, userPrompt }: BuildBrandPromptArgs): string {
  const styleFragment = STYLE_PROMPT_FRAGMENTS[style];
  const preserve =
    "This is the same established character shown in the reference image. Preserve their exact recognizable appearance, coloring, and distinctive features.";

  switch (type) {
    case "logo":
      return [
        preserve,
        `Turn them into a clean, iconic memecoin logo mark for a token called "${characterName}": a simplified, bold, instantly-recognizable icon version of the character's face or a signature pose, centered, with generous padding, on a fully transparent background.`,
        "No text, no words, no ticker symbol baked into the image — just the character icon.",
        styleFragment,
        userPrompt ? `Additional direction: ${userPrompt}` : "",
      ].filter(Boolean).join(" ");
    case "pfp":
      return [
        preserve,
        "Reframe as a tight, centered head-and-shoulders portrait crop suitable for a circular social-media profile picture — bold, eye-catching, reads clearly at a small size.",
        styleFragment,
        userPrompt ? `Additional direction: ${userPrompt}` : "",
      ].filter(Boolean).join(" ");
    case "banner":
      return [
        preserve,
        `Compose a wide horizontal header-banner scene starring the character, with visual room on one side for a wordmark to be added later. This is for the token's X (Twitter) profile banner.${userPrompt ? "" : " Give it a confident, larger-than-life, hype-worthy energy fitting a memecoin community."}`,
        styleFragment,
        userPrompt ? `Additional direction: ${userPrompt}` : "",
      ].filter(Boolean).join(" ");
    case "sticker":
      return [
        preserve,
        "Create a single expressive sticker-style pose (Telegram sticker pack style): bold outline, punchy colors, one clear emotion or gesture, isolated on a fully transparent background with no background scenery at all.",
        styleFragment,
        userPrompt ? `The expression/pose: ${userPrompt}` : "A fun, exaggerated expression.",
      ].filter(Boolean).join(" ");
    case "meme":
      return [
        preserve,
        `Show them in a new comedic reaction pose/scene: ${userPrompt || "an exaggerated, funny reaction, classic internet-meme energy"}.`,
        "Leave clear empty space at the top and bottom of the image for a meme caption to be added afterward — do not render any text or letters into the image yourself.",
        styleFragment,
      ].filter(Boolean).join(" ");
  }
}
