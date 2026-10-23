import "server-only";

import { createAdminClient, hasServiceRole } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { signPaths } from "@/lib/storage";
import { checkMintAddressFormat } from "@/lib/solana/mint";
import { fetchDetailedTokenMarketData } from "@/lib/tokens/market-data";
import type { PublicTokenDTO } from "@/lib/tokens/types";

interface TokenRow {
  character_id: string;
  mint_address: string;
  token_name: string | null;
  token_ticker: string | null;
  launchpad_id: "pump-fun" | "raydium-launchlab" | null;
  verified_on_chain: boolean;
  decimals: number | null;
  created_at: string;
  updated_at: string;
}

interface CharacterRow {
  id: string;
  owner_id: string;
  name: string;
  style: string;
  is_public: boolean;
  cover_image_id: string | null;
  created_at: string;
}

interface ProfileRow {
  character_id: string;
  title: string;
  catchphrase: string;
  personality: string;
  origin_story: string;
}

interface ImageRow {
  id: string;
  character_id: string;
  storage_path: string;
  kind: string;
}

interface CreatorRow {
  id: string;
  username: string;
  display_name: string;
}


function isReady(): boolean {
  return isSupabaseConfigured() && hasServiceRole();
}

async function getCharacterInfo(
  admin: ReturnType<typeof createAdminClient>,
  tokenRows: TokenRow[],
): Promise<PublicTokenDTO[]> {
  if (!tokenRows.length) return [];

  const characterIds = [...new Set(tokenRows.map((token) => token.character_id))];
  const { data: characterData, error: characterError } = await admin
    .from("characters")
    .select("id, owner_id, name, style, is_public, cover_image_id, created_at")
    .in("id", characterIds)
    .eq("is_public", true);

  if (characterError || !characterData?.length) {
    if (characterError) console.error("[LoreForge] Token character lookup failed:", characterError.message);
    return [];
  }

  const characters = characterData as CharacterRow[];
  const publicIds = new Set(characters.map((character) => character.id));
  const visibleTokens = tokenRows.filter((token) => publicIds.has(token.character_id));
  if (!visibleTokens.length) return [];

  const visibleCharacters = characters.filter((character) => visibleTokens.some((token) => token.character_id === character.id));
  const ownerIds = [...new Set(visibleCharacters.map((character) => character.owner_id))];
  const coverIds = [...new Set(visibleCharacters.map((character) => character.cover_image_id).filter((id): id is string => Boolean(id)))];
  const ids = visibleCharacters.map((character) => character.id);

  const [profilesResult, creatorsResult, imagesResult] = await Promise.all([
    admin.from("character_profiles").select("character_id, title, catchphrase, personality, origin_story").in("character_id", ids),
    admin.from("profiles").select("id, username, display_name").in("id", ownerIds),
    coverIds.length
      ? admin.from("character_images").select("id, character_id, storage_path, kind").in("id", coverIds).in("kind", ["original", "scene"])
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesResult.error) console.error("[LoreForge] Token lore lookup failed:", profilesResult.error.message);
  if (creatorsResult.error) console.error("[LoreForge] Token creator lookup failed:", creatorsResult.error.message);
  if (imagesResult.error) console.error("[LoreForge] Token cover lookup failed:", imagesResult.error.message);

  const loreByCharacter = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((row) => [row.character_id, row]));
  const creatorById = new Map(((creatorsResult.data ?? []) as CreatorRow[]).map((row) => [row.id, row]));
  const imageById = new Map(((imagesResult.data ?? []) as ImageRow[]).map((row) => [row.id, row]));
  const coverPaths = visibleCharacters
    .map((character) => character.cover_image_id ? imageById.get(character.cover_image_id)?.storage_path : null)
    .filter((path): path is string => Boolean(path));
  const signedUrls = await signPaths(coverPaths);

  const rows = visibleTokens.map((token): PublicTokenDTO | null => {
    const character = visibleCharacters.find((item) => item.id === token.character_id);
    if (!character) return null;
    const lore = loreByCharacter.get(character.id);
    const creator = creatorById.get(character.owner_id);
    const image = character.cover_image_id ? imageById.get(character.cover_image_id) : null;

    return {
      mintAddress: token.mint_address,
      tokenName: token.token_name,
      tokenTicker: token.token_ticker,
      launchpadId: token.launchpad_id,
      verifiedOnChain: token.verified_on_chain,
      decimals: token.decimals,
      associatedAt: token.created_at,
      updatedAt: token.updated_at,
      character: {
        id: character.id,
        name: character.name,
        style: character.style,
        createdAt: character.created_at,
        coverUrl: image ? signedUrls.get(image.storage_path) ?? null : null,
        creatorUsername: creator?.username ?? "creator",
        creatorDisplayName: creator?.display_name ?? "LoreForge creator",
        lore: {
          title: lore?.title || null,
          catchphrase: lore?.catchphrase || null,
          personality: lore?.personality || null,
          originStory: lore?.origin_story || null,
        },
      },
    };
  }).filter((row): row is PublicTokenDTO => row !== null);

  return rows;
}

/** Public directory: only tokens associated with characters explicitly published by their owners. */
export async function getPublicTokenDirectory(limit = 100): Promise<PublicTokenDTO[]> {
  if (!isReady()) return [];
  const admin = createAdminClient();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const { data, error } = await admin
    .from("character_tokens")
    .select("character_id, mint_address, token_name, token_ticker, launchpad_id, verified_on_chain, decimals, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error("[LoreForge] Public token directory query failed:", error.message);
    return [];
  }
  return getCharacterInfo(admin, (data ?? []) as TokenRow[]);
}

/** Public details: private characters intentionally behave exactly like missing tokens. */
export async function getPublicTokenByMint(mintAddress: string): Promise<PublicTokenDTO | null> {
  const format = checkMintAddressFormat(mintAddress);
  if (!format.ok || !isReady()) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("character_tokens")
    .select("character_id, mint_address, token_name, token_ticker, launchpad_id, verified_on_chain, decimals, created_at, updated_at")
    .eq("mint_address", mintAddress)
    .maybeSingle();

  if (error) {
    console.error("[LoreForge] Public token details query failed:", error.message);
    return null;
  }
  if (!data) return null;

  const [item] = await getCharacterInfo(admin, [data as TokenRow]);
  if (!item) return null;
  return { ...item, market: await fetchDetailedTokenMarketData(item.mintAddress) };
}
