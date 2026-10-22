import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { IMAGE_BUCKET, removeFromStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // drafts older than 24h that were never saved
const PAGE = 100;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed: no secret configured = nobody can call this
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Deletes unsaved generated drafts (pending/*) older than 24h so Storage
 * doesn't grow forever. Saved characters are unaffected: saving MOVES the
 * object out of pending/. Called daily by Vercel Cron (see vercel.json),
 * which sends `Authorization: Bearer $CRON_SECRET` automatically.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isSupabaseConfigured() || !hasServiceRole()) return NextResponse.json({ removed: 0, skipped: "not configured" });

  const storage = createAdminClient().storage.from(IMAGE_BUCKET);
  const cutoff = Date.now() - MAX_AGE_MS;
  let removed = 0;
  let failed = 0;

  // Remove expired rate-limit records; one day is comfortably beyond the
  // longest window used by the application.
  const { error: rateLimitCleanupError } = await createAdminClient()
    .from("rate_limit_events")
    .delete()
    .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if (rateLimitCleanupError) console.error("[LoreForge] Rate-limit event cleanup failed:", rateLimitCleanupError.message);

  // Always re-list from offset 0: each pass deletes what it found, so the
  // next listing naturally advances. Bounded loop as a safety net.
  for (let pass = 0; pass < 20; pass++) {
    const { data, error } = await storage.list("pending", { limit: PAGE, sortBy: { column: "created_at", order: "asc" } });
    if (error) {
      console.error("[LoreForge] pending cleanup list failed:", error.message);
      break;
    }
    const stale = (data ?? [])
      .filter((o) => o.name && o.created_at && new Date(o.created_at).getTime() < cutoff)
      .map((o) => `pending/${o.name}`);
    if (stale.length === 0) break;
    const result = await removeFromStorage(stale);
    if (result.ok) {
      removed += stale.length;
    } else {
      failed += result.failedPaths.length;
      // Re-listing would return the same failed objects and spin through
      // repeated attempts in this invocation. Leave them for the next cron.
      break;
    }
    if (stale.length < PAGE) break;
  }

  // Retry paths persisted by character deletion. Never delete an object while
  // a character_images row still references it: a preceding character delete
  // may have failed after the queue row was written.
  let cleanupJobsRemoved = 0;
  const { data: jobs, error: jobsError } = await createAdminClient()
    .from("storage_cleanup_jobs")
    .select("storage_path, attempts")
    .order("created_at", { ascending: true })
    .limit(PAGE);

  if (jobsError) {
    console.error("[LoreForge] Storage cleanup queue lookup failed:", jobsError.message);
    failed++;
  } else if (jobs?.length) {
    const jobPaths = [...new Set(jobs.map((job: { storage_path: string }) => job.storage_path).filter(Boolean))];
    const { data: referenced, error: referenceError } = await createAdminClient()
      .from("character_images")
      .select("storage_path")
      .in("storage_path", jobPaths);

    if (referenceError) {
      console.error("[LoreForge] Storage cleanup reference check failed:", referenceError.message);
      failed++;
    } else {
      const referencedPaths = new Set((referenced ?? []).map((row: { storage_path: string }) => row.storage_path));
      const stillReferenced = jobPaths.filter((path) => referencedPaths.has(path));
      const orphaned = jobPaths.filter((path) => !referencedPaths.has(path));

      // Cancel jobs for objects that are still in use.
      if (stillReferenced.length > 0) {
        const { error } = await createAdminClient().from("storage_cleanup_jobs").delete().in("storage_path", stillReferenced);
        if (error) {
          console.error("[LoreForge] Could not cancel cleanup jobs for live images:", error.message);
          failed += stillReferenced.length;
        } else {
          cleanupJobsRemoved += stillReferenced.length;
        }
      }

      if (orphaned.length > 0) {
        const result = await removeFromStorage(orphaned);
        if (result.ok) {
          const { error } = await createAdminClient().from("storage_cleanup_jobs").delete().in("storage_path", orphaned);
          if (error) {
            console.error("[LoreForge] Images removed but cleanup queue rows remain:", error.message);
            failed += orphaned.length;
          } else {
            cleanupJobsRemoved += orphaned.length;
          }
        } else {
          failed += result.failedPaths.length;
          const byPath = new Map(jobs.map((job: { storage_path: string; attempts: number }) => [job.storage_path, job.attempts] as const));
          for (const path of result.failedPaths) {
            const { error } = await createAdminClient().from("storage_cleanup_jobs").update({
              attempts: Number(byPath.get(path) ?? 0) + 1,
              last_error: "Storage removal failed; scheduled for retry.",
              updated_at: new Date().toISOString(),
            }).eq("storage_path", path);
            if (error) console.error("[LoreForge] Failed to update cleanup job for a path:", error.message);
          }
        }
      }
    }
  }

  return NextResponse.json({ removed, cleanupJobsRemoved, failed });
}
