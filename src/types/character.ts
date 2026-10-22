export type ArtStyle =
  | "3d_animation"
  | "cartoon"
  | "anime"
  | "cyberpunk"
  | "internet_meme"
  | "comic_book"
  | "fantasy"
  | "clay_animation"
  | "video_game";

export const ART_STYLES: { value: ArtStyle; label: string }[] = [
  { value: "3d_animation", label: "3D Animation" },
  { value: "cartoon", label: "Cartoon" },
  { value: "anime", label: "Anime" },
  { value: "cyberpunk", label: "Cyberpunk" },
  { value: "internet_meme", label: "Internet Meme" },
  { value: "comic_book", label: "Comic Book" },
  { value: "fantasy", label: "Fantasy" },
  { value: "clay_animation", label: "Clay Animation" },
  { value: "video_game", label: "Video Game" },
];

export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

export interface CharacterProfile {
  name: string;
  title: string;
  personality: string;
  catchphrase: string;
  originStory: string;
  likes: string[];
  dislikes: string[];
}

export interface Character {
  id: string;
  ownerId: string;
  name: string;
  style: ArtStyle;
  prompt: string;
  imageUrl: string;
  referenceImageUrl: string | null;
  profile: CharacterProfile | null;
  isPublic: boolean;
  likeCount: number;
  viewCount: number;
  walletAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationRequest {
  imageBase64: string;
  prompt: string;
  style: ArtStyle;
  aspectRatio: AspectRatio;
  autoDirection: boolean;
  referenceCharacterId?: string;
}

export interface GenerationResult {
  imageUrl: string;
  revisedPrompt?: string;
}
