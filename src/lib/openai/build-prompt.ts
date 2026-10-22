import type { ArtStyle } from "@/types/character";
import { STYLE_PROMPT_FRAGMENTS } from "./style-prompts";

interface BuildPromptArgs {
  description: string;
  style: ArtStyle;
  autoDirection: boolean;
}

export function buildGenerationPrompt({ description, style, autoDirection }: BuildPromptArgs): string {
  const styleFragment = STYLE_PROMPT_FRAGMENTS[style];

  const directionFragment = autoDirection
    ? "Study the uploaded photo and invent your own bold, imaginative, unexpected fictional-character transformation for the subject shown — surprise the viewer with a creative concept."
    : `Transformation to apply: ${description}`;

  return [
    "You are creating a brand-new, entirely original fictional character illustration. Use the uploaded photo only as a visual reference for recognizable features — silhouette, coloring, distinguishing marks, general likeness — not as a base to lightly filter.",
    directionFragment,
    styleFragment,
    "The output must be a genuinely new, fully rendered character illustration in a new setting or pose as implied by the description — never simply the original photo with a filter, sticker, text, or caption placed over it.",
  ].join(" ");
}

interface BuildScenePromptArgs {
  sceneDescription: string;
  style: ArtStyle;
}

/**
 * Used for character-consistency requests — e.g. "generate my pigeon
 * driving a Lamborghini" — where the reference image is a *previously
 * generated character*, not a raw photo. The framing is different: the
 * goal here is to keep the character's established look intact while
 * placing them in a new scene, pose, or outfit, rather than inventing a
 * new character from scratch.
 */
export function buildScenePrompt({ sceneDescription, style }: BuildScenePromptArgs): string {
  const styleFragment = STYLE_PROMPT_FRAGMENTS[style];

  return [
    "This is the same established fictional character shown in the reference image. Preserve their recognizable appearance, coloring, clothing, and distinctive visual characteristics exactly as shown.",
    `New scene to depict: ${sceneDescription}`,
    styleFragment,
    "Only change what the new scene requires (setting, pose, props, expression) — do not redesign the character itself.",
  ].join(" ");
}
