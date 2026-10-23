import { NextResponse } from "next/server";

import { getLaunchpadById } from "@/lib/launchpads/registry";
import { getServerUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createAdminClient,
  hasServiceRole,
} from "@/lib/supabase/server";
import {
  checkRateLimitAsync,
  getClientKey,
} from "@/lib/rate-limit";

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

  // Only a registered launchpad ID can select a destination.
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

  let destination: URL;

  try {
    destination = new URL(launchpad.launchUrl);
  } catch {
    return handoffError("Invalid launch destination.", 503);
  }

  if (destination.protocol !== "https:") {
    return handoffError("Invalid launch destination.", 503);
  }

  // Use LoreForge's existing rate limiter.
  try {
    const limit = await checkRateLimitAsync(
      `launchpad-handoff:${getClientKey(req)}`,
      30,
    );

    if (!limit.allowed) {
      const response = handoffError(
        "Too many requests. Please try again later.",
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
      "Launch tracking is temporarily unavailable.",
      503,
    );
  }

  // Record a verified user ID when available. Otherwise, record anonymously.
  let userId: string | null = null;

  try {
    const { user } = await getServerUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  // Save the event before redirecting.
  try {
    const { error } = await createAdminClient()
      .from("launchpad_clicks")
      .insert({
        launchpad_id: launchpad.id,
        user_id: userId,
        source: "directory",
      });

    if (error) {
      console.error(
        "[LoreForge] Launchpad click insert failed:",
        error.message,
      );

      return handoffError(
        "The handoff could not be recorded, so no redirect was made.",
        503,
      );
    }
  } catch {
    return handoffError(
      "Launch tracking failed, so no redirect was made.",
      503,
    );
  }

  // Redirect only to the registry's official URL.
  // No referral parameters or conversion claims are added.
  const response = NextResponse.redirect(destination, 302);

  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");

  return response;
}