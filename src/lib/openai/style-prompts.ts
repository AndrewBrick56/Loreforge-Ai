import type { ArtStyle } from "@/types/character";

export const STYLE_PROMPT_FRAGMENTS: Record<ArtStyle, string> = {
  "3d_animation":
    "Render as a polished 3D animated character in the style of a modern animated feature film — stylized proportions, soft global illumination, rich subsurface-scattering shading on skin or fur, cinematic depth of field.",
  cartoon:
    "Render as a vibrant 2D cartoon character with bold clean outlines, flat cel-shaded colors, and charming exaggerated proportions.",
  anime:
    "Render as a Japanese anime-style character — clean line art, expressive large eyes, dynamic cel shading, a classic anime color palette.",
  cyberpunk:
    "Render in a neon-drenched cyberpunk aesthetic — chrome and holographic details, a moody rain-slicked city backdrop, magenta and cyan rim lighting.",
  internet_meme:
    "Render in the exaggerated, humorous style of a viral internet meme character — bold saturated colors, comedic exaggeration, punchy high-contrast lighting.",
  comic_book:
    "Render as a comic book illustration — bold ink outlines, halftone shading, a dynamic action-pose composition, punchy primary colors.",
  fantasy:
    "Render as an epic fantasy character — ornate detailed costuming, painterly digital-art lighting, a mythic atmospheric backdrop.",
  clay_animation:
    "Render as a stop-motion claymation character — visible clay sculpting texture, matte surfaces, a charmingly imperfect handcrafted look, soft studio lighting.",
  video_game:
    "Render as a AAA video game character — detailed next-gen game-engine rendering, dramatic rim lighting, a stylized in-game environment backdrop.",
};
