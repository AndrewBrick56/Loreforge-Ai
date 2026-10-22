import type { ArtStyle } from "./character";

/** Shapes returned by our Supabase queries (snake_case, as stored). */
export interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
}

export interface CharacterProfileRow {
  character_id: string;
  title: string;
  personality: string;
  catchphrase: string;
  origin_story: string;
  likes: string[];
  dislikes: string[];
}

export interface CharacterImageRow {
  id: string;
  character_id: string;
  storage_path: string;
  kind: "source" | "original" | "scene" | "logo" | "pfp" | "banner" | "sticker" | "meme";
  scene_prompt: string | null;
  aspect_ratio: string | null;
  created_at: string;
}

export interface CharacterRow {
  id: string;
  owner_id: string;
  name: string;
  style: ArtStyle;
  prompt: string;
  is_public: boolean;
  cover_image_id: string | null;
  like_count: number;
  view_count: number;
  created_at: string;
}

export interface ExploreRow {
  id: string;
  name: string;
  style: ArtStyle;
  created_at: string;
  like_count: number;
  view_count: number;
  cover_path: string | null;
  creator_username: string;
  creator_display_name: string;
  title: string | null;
  catchphrase: string | null;
}
