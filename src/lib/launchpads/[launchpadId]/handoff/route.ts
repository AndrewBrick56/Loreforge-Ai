

import { NextResponse } from "next/server";

import { getLaunchpadById } from "@/lib/launchpads/registry";
import { getServerUser, UUID_RE } from "@/lib/auth";
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
  const launchpad = getLaunchpadById(launchpadId);

  if (!launchpad) {
    return handoffError("Launchpad not found.", 404);
  }

  const url = new URL(req.url);
  const source = url.searchParams.get("source") ?? "directory";
  const projectId = url.searchParams.get("projectId");

  console.info("[LoreForge] Handoff request", {
  launchpadId,
  source,
  hasProjectId: Boolean(projectId),
});

  if (source !== "directory" && source !== "launch_kit") {
    return handoffError("Invalid handoff source.", 400);
  }

  if (
    source === "launch_kit" &&
    (!projectId || !UUID_RE.test(projectId))
  ) {
    return handoffError("A valid saved project is required.", 400);
  }

  if (source === "directory" && projectId) {
    return handoffError("Invalid project handoff.", 400);
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
      "Launch tracking is unavailable. No redirect was made.",
      503,
    );
  }

  let userId: string | null = null;

  try {
    const { supabase, user } = await getServerUser();
    userId = user?.id ?? null;

    if (source === "launch_kit") {
      if (!user || !supabase) {
        return handoffError(
          "Sign in to continue from a saved project.",
          401,
        );
      }

      const { data: project, error } = await supabase
        .from("launch_projects")
        .select("id, selected_launchpad_id")
        .eq("id", projectId!)
        .eq("owner_id", user.id)
        .maybeSingle();

      if (error) {
        console.error(
          "[LoreForge] Handoff project lookup failed:",
          error.message,
        );

        return handoffError("Couldn't verify the saved project.", 503);
      }

      if (!project) {
        return handoffError("Saved project not found.", 404);
      }

      if (project.selected_launchpad_id !== launchpad.id) {
        return handoffError(
          "Save this launchpad as your project's preference first.",
          400,
        );
      }
    }
  } catch {
    if (source === "launch_kit") {
      return handoffError(
        "Your sign-in could not be verified.",
        401,
      );
    }

    // Signed-out directory visitors may still be recorded anonymously.
    userId = null;
  }

  try {
    const { error } = await createAdminClient()
      .from("launchpad_clicks")
      .insert({
  launchpad_id: launchpad.id,
  user_id: userId,
  source,
  project_id: source === "launch_kit" ? projectId : null,
});

    if (error) {
      console.error(
        "[LoreForge] Launchpad click recording failed:",
        error.message,
      );

      return handoffError(
        "The handoff could not be recorded, so no redirect was made.",
        503,
      );
    }
  } catch {
    return handoffError(
      "Launch tracking failed. No redirect was made.",
      503,
    );
  }

  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");

  return response;
}
