import { z } from "zod";

export const ART_STYLE_VALUES = [
  "3d_animation", "cartoon", "anime", "cyberpunk", "internet_meme",
  "comic_book", "fantasy", "clay_animation", "video_game",
] as const;

export const ASPECT_RATIO_VALUES = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;

const shortList = z.array(z.string().trim().min(1).max(60)).max(8);

/** Mirrors the length CHECK constraints on public.character_profiles. */
export const loreSchema = z.object({
  title: z.string().trim().max(120),
  personality: z.string().trim().max(600),
  catchphrase: z.string().trim().max(200),
  originStory: z.string().trim().max(1500),
  likes: shortList,
  dislikes: shortList,
});

export type Lore = z.infer<typeof loreSchema>;
