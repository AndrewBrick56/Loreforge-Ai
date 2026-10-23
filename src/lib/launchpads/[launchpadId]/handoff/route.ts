
import { NextResponse } from "next/server";

import { getLaunchpadById } from "@/lib/launchpads/registry";
import { getServerUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createAdminClient,
  hasServiceRole,
} from "@/lib/supabase/server";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const handoffRequests = new Map<string, { count: number; resetAt: number }>();

function checkHandoffRateLimit(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const clientKey =
    forwardedFor?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const now = Date.now();
  let entry = handoffRequests.get(clientKey);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    handoffRequests.set(clientKey, entry);
  }

  entry.count += 1;

  if (handoffRequests.size > 10_000) {
    for (const [key, value] of handoffRequests) {
      if (value.resetAt <= now) handoffRequests.delete(key);
    }
  }

  return {
    allowed: entry.count <= RATE_LIMIT_MAX,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handoffError(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function GET(
  req: Request,
  context: { params: Promise<{ launchpadId: string }> },
) {
  const { launchpadId } = await context.params;

  // A registry ID—not a browser-supplied URL—selects the destination.
  const launchpad = getLaunchpadById(launchpadId);

  if (!launchpad) {
    return handoffError("Launchpad not found.", 404);
  }

  if (!isSupabaseConfigured() || !hasServiceRole()) {
    return handoffError(
      "Launch tracking is not configured. No redirect was made.",
      503,
    );
  }

  // Keep destinations restricted to HTTPS.
  let destination: URL;

  try {
    destination = new URL(launchpad.launchUrl);
  } catch {
    return handoffError("This launch destination is unavailable.", 503);
  }

  if (destination.protocol !== "https:") {
    return handoffError("This launch destination is unavailable.", 503);
  }

  // Use LoreForge's existing shared rate limiter.
  try {
    const limit = checkHandoffRateLimit(req);

    if (!limit.allowed) {
      const response = handoffError(
        "Too many launch requests. Please try again later.",
        429,
      );

      response.headers.set(
        "Retry-After",
        String(limit.retryAfterSeconds ?? 60),
      );

      return response;
    }
  } catch {
    return handoffError(
      "Launch tracking is temporarily unavailable. Please try again.",
      503,
    );
  }

  // Associate a verified, signed-in user when available.
  // Signed-out clicks are recorded with a null user_id.
  let userId: string | null = null;

  try {
    const { user } = await getServerUser();
    userId = user?.id ?? null;
  } catch {
    // Do not store unverified identity information.
    userId = null;
  }

  // Record the handoff before redirecting. Never add referral parameters here.
  try {
    const { error } = await createAdminClient()
      .from("launchpad_clicks")
      .insert({
        launchpad_id: launchpad.id,
        user_id: userId,
        source: "directory",
      });

    if (error) {
      console.error("[LoreForge] Launchpad click recording failed:", {
        launchpadId: launchpad.id,
        message: error.message,
      });

      return handoffError(
        "We couldn't record this handoff, so the launch page was not opened. Please try again.",
        503,
      );
    }
  } catch {
    return handoffError(
      "Launch tracking failed. The launch page was not opened.",
      503,
    );
  }

  // The redirect target comes exclusively from the server-side registry.
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");

  return response;
}
