import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signPaths } from "@/lib/storage";
import { downloadName } from "@/lib/format";
import { ART_STYLES, type ArtStyle } from "@/types/character";
import type { CharacterImageRow, CharacterProfileRow, CharacterRow, ExploreRow, ProfileRow } from "@/types/db";

export interface LoreDTO {
  title: string;
  personality: string;
  catchphrase: string;
  originStory: string;
  likes: string[];
  dislikes: string[];
}

function toLore(row: CharacterProfileRow | null | undefined): LoreDTO | null {
  if (!row) return null;
  return {
    title: row.title,
    personality: row.personality,
    catchphrase: row.catchphrase,
    originStory: row.origin_story,
    likes: row.likes ?? [],
    dislikes: row.dislikes ?? [],
  };
}

// ---------------------------------------------------------------- My characters

export interface MyCharacterDTO {
  id: string;
  name: string;
  style: ArtStyle;
  isPublic: boolean;
  likeCount: number;
  viewCount: number;
  createdAt: string;
  imageCount: number;
  coverUrl: string | null;
  downloadUrl: string | null;
  lore: LoreDTO | null;
}

export async function getMyCharacters(supabase: SupabaseClient, userId: string): Promise<MyCharacterDTO[]> {
  const { data: chars, error } = await supabase
    .from("characters")
    .select("id, owner_id, name, style, prompt, is_public, cover_image_id, like_count, view_count, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error || !chars) {
    console.error("[LoreForge] getMyCharacters failed:", error?.message);
    return [];
  }
  const rows = chars as CharacterRow[];
  if (rows.length === 0) return [];
  const ids = rows.map((c) => c.id);

  const [{ data: images }, { data: lore }] = await Promise.all([
    supabase.from("character_images").select("id, character_id, storage_path, kind, created_at").in("character_id", ids).order("created_at", { ascending: true }),
    supabase.from("character_profiles").select("*").in("character_id", ids),
  ]);

  const imagesBy = new Map<string, Pick<CharacterImageRow, "id" | "storage_path" | "kind">[]>();
  for (const img of (images ?? []) as CharacterImageRow[]) {
    if (img.kind === "source") continue; // the raw upload isn't a "generated image" for display purposes
    const list = imagesBy.get(img.character_id) ?? [];
    list.push(img);
    imagesBy.set(img.character_id, list);
  }
  const loreBy = new Map(((lore ?? []) as CharacterProfileRow[]).map((l) => [l.character_id, l]));

  const coverPathOf = (c: CharacterRow) => {
    const list = imagesBy.get(c.id) ?? [];
    return (list.find((i) => i.id === c.cover_image_id) ?? list[0])?.storage_path ?? null;
  };
  const coverPaths = rows.map(coverPathOf).filter((p): p is string => Boolean(p));
  const [viewUrls, dlUrls] = await Promise.all([signPaths(coverPaths), signPaths(coverPaths, { download: "loreforge-character.png" })]);

  return rows.map((c) => {
    const path = coverPathOf(c);
    return {
      id: c.id,
      name: c.name,
      style: c.style,
      isPublic: c.is_public,
      likeCount: c.like_count,
      viewCount: c.view_count,
      createdAt: c.created_at,
      imageCount: imagesBy.get(c.id)?.length ?? 0,
      coverUrl: path ? viewUrls.get(path) ?? null : null,
      downloadUrl: path ? dlUrls.get(path) ?? null : null,
      lore: toLore(loreBy.get(c.id)),
    };
  });
}

// ---------------------------------------------------------------- Explore

export type ExploreSort = "trending" | "newest" | "liked";

export interface ExploreCardDTO {
  id: string;
  name: string;
  style: ArtStyle;
  likeCount: number;
  viewCount: number;
  coverUrl: string | null;
  creatorUsername: string;
  creatorDisplayName: string;
  title: string | null;
}

export function parseSort(v: string | undefined): ExploreSort {
  return v === "newest" || v === "liked" ? v : "trending";
}
export function parseStyle(v: string | undefined): ArtStyle | null {
  return ART_STYLES.find((s) => s.value === v)?.value ?? null;
}

export async function getExplore(
  supabase: SupabaseClient,
  opts: { sort: ExploreSort; style: ArtStyle | null; q: string; creator?: string; limit?: number }
): Promise<ExploreCardDTO[]> {
  let query = supabase.from("explore_characters").select("*").limit(opts.limit ?? 48);

  if (opts.style) query = query.eq("style", opts.style);
  if (opts.creator) query = query.eq("creator_username", opts.creator);

  // Strip characters that have meaning inside a PostgREST filter expression or an ILIKE pattern.
  const safe = opts.q.replace(/[%_,()"\\*]/g, " ").trim().slice(0, 60);
  if (safe) query = query.or(`name.ilike.%${safe}%,title.ilike.%${safe}%`);

  if (opts.sort === "newest") query = query.order("created_at", { ascending: false });
  else if (opts.sort === "liked") query = query.order("like_count", { ascending: false }).order("created_at", { ascending: false });
  else query = query.order("trending_score", { ascending: false });

  const { data, error } = await query;
  if (error || !data) {
    console.error("[LoreForge] getExplore failed:", error?.message);
    return [];
  }
  const rows = data as ExploreRow[];
  const urls = await signPaths(rows.map((r) => r.cover_path).filter((p): p is string => Boolean(p)));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    style: r.style,
    likeCount: r.like_count,
    viewCount: r.view_count,
    coverUrl: r.cover_path ? urls.get(r.cover_path) ?? null : null,
    creatorUsername: r.creator_username,
    creatorDisplayName: r.creator_display_name,
    title: r.title,
  }));
}

// ---------------------------------------------------------------- Detail page

export interface BrandAssetDTO {
  id: string;
  url: string | null;
  downloadUrl: string | null;
  kind: "logo" | "pfp" | "banner" | "sticker" | "meme";
  prompt: string | null;
}

export interface CharacterDetailDTO {
  id: string;
  name: string;
  style: ArtStyle;
  prompt: string | null; // only ever populated for the owner
  isPublic: boolean;
  isOwner: boolean;
  likeCount: number;
  viewCount: number;
  createdAt: string;
  creator: { username: string; displayName: string };
  lore: LoreDTO | null;
  liked: boolean;
  images: { id: string; url: string | null; downloadUrl: string | null; kind: "original" | "scene"; scenePrompt: string | null }[];
  brandAssets: BrandAssetDTO[];
  /** Owner-only: the raw photo they originally uploaded, stored separately from the generated character. */
  sourcePhotoUrl: string | null;
}

/** Returns null when the character doesn't exist OR the viewer isn't allowed to see it (row-level security). */
export async function getCharacterDetail(
  supabase: SupabaseClient,
  id: string,
  viewerId: string | null
): Promise<CharacterDetailDTO | null> {
  const { data: c } = await supabase
    .from("characters")
    .select("id, owner_id, name, style, prompt, is_public, cover_image_id, like_count, view_count, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!c) return null;
  const ch = c as CharacterRow;

  const [{ data: creator }, { data: images }, { data: lore }, likedRes] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name").eq("id", ch.owner_id).maybeSingle(),
    supabase.from("character_images").select("id, character_id, storage_path, kind, scene_prompt, created_at").eq("character_id", id).order("created_at", { ascending: true }),
    supabase.from("character_profiles").select("*").eq("character_id", id).maybeSingle(),
    viewerId
      ? supabase.from("likes").select("character_id").eq("character_id", id).eq("user_id", viewerId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!creator) return null;

  const allRows = (images ?? []) as CharacterImageRow[];
  const isOwner = viewerId === ch.owner_id;

  const storyRows = allRows.filter((r) => r.kind === "original" || r.kind === "scene");
  storyRows.sort((a, b) => Number(b.id === ch.cover_image_id) - Number(a.id === ch.cover_image_id));
  const brandRows = allRows.filter((r): r is CharacterImageRow & { kind: BrandAssetDTO["kind"] } =>
    (["logo", "pfp", "banner", "sticker", "meme"] as const).includes(r.kind as never)
  );
  const sourceRow = isOwner ? allRows.find((r) => r.kind === "source") : undefined;

  const allPaths = [...storyRows, ...brandRows, ...(sourceRow ? [sourceRow] : [])].map((r) => r.storage_path);
  const [viewUrls, dlUrls] = await Promise.all([signPaths(allPaths), signPaths(allPaths, { download: downloadName(ch.name) })]);
  const p = creator as ProfileRow;

  return {
    id: ch.id,
    name: ch.name,
    style: ch.style,
    prompt: isOwner ? ch.prompt : null,
    isPublic: ch.is_public,
    isOwner,
    likeCount: ch.like_count,
    viewCount: ch.view_count,
    createdAt: ch.created_at,
    creator: { username: p.username, displayName: p.display_name },
    lore: toLore(lore as CharacterProfileRow | null),
    liked: Boolean(likedRes.data),
    images: storyRows.map((i) => ({
      id: i.id,
      url: viewUrls.get(i.storage_path) ?? null,
      downloadUrl: dlUrls.get(i.storage_path) ?? null,
      kind: i.kind as "original" | "scene",
      scenePrompt: i.scene_prompt,
    })),
    brandAssets: brandRows.map((i) => ({
      id: i.id,
      url: viewUrls.get(i.storage_path) ?? null,
      downloadUrl: dlUrls.get(i.storage_path) ?? null,
      kind: i.kind,
      prompt: i.scene_prompt,
    })),
    sourcePhotoUrl: sourceRow ? viewUrls.get(sourceRow.storage_path) ?? null : null,
  };
}
