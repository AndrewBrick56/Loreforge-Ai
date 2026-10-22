import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

const WINDOW_MS = 10 * 60 * 1000;
export const USER_MAX_GENERATIONS_PER_WINDOW = 12;

/** Per-user limit, backed by the database so it survives restarts and works across server instances. */
export async function countRecentGenerations(userId: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await createAdminClient()
    .from("generation_history")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) {
    console.error("[LoreForge] generation_history count failed:", error.message);
    return 0; // fail open on a logging-table hiccup; the IP limiter still applies
  }
  return count ?? 0;
}

export async function logGeneration(entry: {
  userId: string;
  characterId?: string | null;
  mode: "new_character" | "new_scene";
  style: string;
  prompt: string;
  model: string;
  status: "success" | "error";
  errorCode?: string;
}): Promise<void> {
  const { error } = await createAdminClient().from("generation_history").insert({
    user_id: entry.userId,
    character_id: entry.characterId ?? null,
    mode: entry.mode,
    style: entry.style,
    prompt: entry.prompt.slice(0, 500),
    model: entry.model,
    status: entry.status,
    error_code: entry.errorCode ?? null,
  });
  if (error) console.error("[LoreForge] generation_history insert failed:", error.message);
}
