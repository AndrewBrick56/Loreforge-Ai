import "server-only";
import { createHmac } from "crypto";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/server";

const WINDOW_SECONDS = 10 * 60;
const WINDOW_MS = WINDOW_SECONDS * 1000;
const MAX_REQUESTS = 12;
const MAX_TRACKED_KEYS = 5000;

const hits = new Map<string, number[]>();
let fallbackCalls = 0;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds?: number };

/** Local development fallback only; it is not a distributed production limiter. */
export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const existing = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (existing.length >= MAX_REQUESTS) {
    const retryAfterMs = existing[0] + WINDOW_MS - now;
    hits.set(key, existing);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  existing.push(now);
  hits.set(key, existing);
  fallbackCalls++;
  // Bound memory growth from requests with many distinct IPs.
  if (hits.size > MAX_TRACKED_KEYS || fallbackCalls % 256 === 0) {
    for (const [trackedKey, timestamps] of hits) {
      const fresh = timestamps.filter((t) => t > windowStart);
      if (fresh.length === 0) hits.delete(trackedKey);
      else hits.set(trackedKey, fresh);
      if (hits.size <= MAX_TRACKED_KEYS) break;
    }
    while (hits.size > MAX_TRACKED_KEYS) hits.delete(hits.keys().next().value as string);
  }
  return { allowed: true };
}

/**
 * Use a Postgres advisory lock + rate-limit table when Supabase is configured.
 * The SQL function is installed by migration 003 and makes reservations
 * atomic across concurrent requests and serverless instances. If the shared
 * store is configured but broken/missing, throw so callers fail closed.
 */
export async function checkRateLimitAsync(key: string, maxRequests = MAX_REQUESTS): Promise<RateLimitResult> {
  if (!isSupabaseConfigured() || !hasServiceRole()) {
    // Process-local limits are suitable for development only. In production,
    // silently falling back would make the limit reset per instance and allow
    // concurrent/serverless requests to bypass it.
    if (process.env.NODE_ENV === "production") {
      throw new Error("Shared rate limiter requires Supabase URL, anon key, and service-role key in production");
    }
    return checkRateLimit(key);
  }

  const secret = process.env.RATE_LIMIT_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const keyHash = createHmac("sha256", secret).update(key).digest("hex");
  const { data, error } = await createAdminClient().rpc("reserve_rate_limit", {
    p_key_hash: keyHash,
    p_max_requests: maxRequests,
    p_window_seconds: WINDOW_SECONDS,
  });
  if (error) {
    console.error("[LoreForge] Shared rate limiter unavailable:", error.message);
    throw new Error("Shared rate limiter unavailable");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== "boolean") {
    console.error("[LoreForge] Shared rate limiter returned an invalid response.");
    throw new Error("Shared rate limiter returned an invalid response");
  }
  const retryAfter = Number(row.retry_after_seconds);
  return { allowed: row.allowed, retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : undefined };
}

/**
 * Prefer the hosting proxy's normalized client-IP header. The fallback uses
 * the rightmost forwarded address; deployment must ensure its edge proxy
 * overwrites x-real-ip / appends forwarded headers rather than trusting raw
 * client-provided values. Never use the first x-forwarded-for entry blindly.
 */
export function getClientKey(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp && realIp.length <= 128) return realIp;
  const forwarded = req.headers.get("x-forwarded-for");
  const chain = forwarded?.split(",").map((value) => value.trim()).filter(Boolean);
  const candidate = chain?.at(-1);
  return candidate && candidate.length <= 128 ? candidate : "unknown";
}
