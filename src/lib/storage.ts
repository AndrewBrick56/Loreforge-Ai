import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export const IMAGE_BUCKET = "character-images";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type ImageExt = "png" | "webp" | "jpg";

/** Must match the storage_path_matches_ids CHECK constraint in schema.sql / migration 002. */
export function imagePath(ownerId: string, characterId: string, imageId: string, ext: ImageExt = "png"): string {
  return `${ownerId}/${characterId}/${imageId}.${ext}`;
}

/**
 * Path for a freshly generated image that hasn't been attached to a saved
 * character yet (the studio's "draft" state before the user clicks Save).
 * Not subject to the ids-derived-path CHECK constraint since no
 * character_images row exists for it — that constraint only fires once a
 * row referencing a path is actually inserted. Finalized via moveImage()
 * at save time, once a real owner/character/image id triple exists.
 */
export function pendingImagePath(id: string, ext: ImageExt = "png"): string {
  return `pending/${id}.${ext}`;
}

const CONTENT_TYPE: Record<ImageExt, string> = { png: "image/png", webp: "image/webp", jpg: "image/jpeg" };

export async function uploadImage(path: string, bytes: Buffer, ext: ImageExt = "png"): Promise<void> {
  const { error } = await createAdminClient()
    .storage.from(IMAGE_BUCKET)
    .upload(path, bytes, { contentType: CONTENT_TYPE[ext], upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

/** @deprecated kept for call sites not yet migrated; equivalent to uploadImage(path, bytes, "png"). */
export const uploadPng = (path: string, bytes: Buffer) => uploadImage(path, bytes, "png");

export async function downloadFromStorage(path: string): Promise<Buffer> {
  const { data, error } = await createAdminClient().storage.from(IMAGE_BUCKET).download(path);
  if (error || !data) throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}

export type StorageRemovalResult = { ok: true; failedPaths: [] } | { ok: false; failedPaths: string[] };

/** Remove objects and make failures observable to callers that report cleanup status. */
export async function removeFromStorage(paths: string[]): Promise<StorageRemovalResult> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return { ok: true, failedPaths: [] };
  try {
    const { error } = await createAdminClient().storage.from(IMAGE_BUCKET).remove(unique);
    if (error) {
      console.error("[LoreForge] Storage cleanup failed:", error.message);
      return { ok: false, failedPaths: unique };
    }
    return { ok: true, failedPaths: [] };
  } catch (error) {
    console.error("[LoreForge] Storage cleanup threw:", error);
    return { ok: false, failedPaths: unique };
  }
}

/** Renames/finalizes an object in place — used to promote a pending draft to its permanent, ids-derived path. No bytes travel through our server for this; Supabase moves the object internally. */
export async function moveImage(fromPath: string, toPath: string): Promise<void> {
  const { error } = await createAdminClient().storage.from(IMAGE_BUCKET).move(fromPath, toPath);
  if (error) throw new Error(`Storage move failed: ${error.message}`);
}

/** Convenience single-path wrapper around signPaths, for callers that only ever need one URL at a time. */
export async function signOnePath(path: string, opts?: { download?: string }): Promise<string | null> {
  return (await signPaths([path], opts)).get(path) ?? null;
}

/**
 * Mint short-lived signed URLs. IMPORTANT: this uses the service role, so it
 * will sign ANY path it is given. Callers must only pass paths they obtained
 * from a database query made with the *user's* RLS-enforced client — that
 * query is what proves the requester is allowed to see the image.
 */
export async function signPaths(paths: string[], opts?: { download?: string }): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  // Without the service-role key we can't sign; pages then render without images instead of crashing.
  if (unique.length === 0 || !process.env.SUPABASE_SERVICE_ROLE_KEY) return out;
  const { data, error } = await createAdminClient()
    .storage.from(IMAGE_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS, opts?.download ? { download: opts.download } : undefined);
  if (error || !data) {
    console.error("[LoreForge] Signing URLs failed:", error?.message);
    return out;
  }
  for (const row of data) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}
