import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { generateCharacterIdentity } from "@/lib/openai/generate-identity";
import { checkRateLimitAsync, getClientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

const artStyleValues = [
  "3d_animation",
  "cartoon",
  "anime",
  "cyberpunk",
  "internet_meme",
  "comic_book",
  "fantasy",
  "clay_animation",
  "video_game",
] as const;

const requestSchema = z.object({
  description: z.string().min(1).max(2000),
  style: z.enum(artStyleValues),
});

/**
 * STAGE STATUS: real.
 *
 * Separate from /api/generate on purpose — the spec calls for image
 * generation to work without requiring lore first ("Do not require users
 * to generate lore before creating an image"). This route is called only
 * when the user opts into building out their character's identity.
 */
export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY isn't configured on the server.", code: "MISSING_API_KEY" },
      { status: 501 }
    );
  }

  let rate;
  try {
    rate = await checkRateLimitAsync(`identity:ip:${getClientKey(req)}`);
  } catch {
    return NextResponse.json({ error: "Request protection is temporarily unavailable. Please try again shortly.", code: "RATE_LIMIT_UNAVAILABLE" }, { status: 503 });
  }
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in about ${rate.retryAfterSeconds}s.`, code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Malformed request.", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const profile = await generateCharacterIdentity(parsed);
    return NextResponse.json({ profile });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      console.error("[LoreForge] Identity generation OpenAI error:", err.message);
      return NextResponse.json(
        { error: "The identity model couldn't complete this request. Please try again.", code: "MODEL_ERROR" },
        { status: err.status && [400, 401, 403, 429].includes(err.status) ? err.status : 502 }
      );
    }
    console.error("[LoreForge] Identity generation failed:", err);
    return NextResponse.json(
      { error: "Generating a character profile failed unexpectedly.", code: "GENERATION_FAILED" },
      { status: 502 }
    );
  }
}
