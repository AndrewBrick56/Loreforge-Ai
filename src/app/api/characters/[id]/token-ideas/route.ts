import { NextResponse } from "next/server";
import OpenAI from "openai";
import { isErrorResponse, requireUser, UUID_RE } from "@/lib/auth";
import { generateTokenIdeas } from "@/lib/openai/generate-token-ideas";
import { mapGenerationError, statusForGenerationError } from "@/lib/openai/map-error";

export const runtime = "nodejs";

/** Pure creative brainstorming for a saved character — text only, nothing persisted, nothing on-chain. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY isn't configured on the server.", code: "MISSING_API_KEY" }, { status: 501 });
  }
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth;
  const { supabase, user } = auth;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Character not found." }, { status: 404 });

  const { data: character } = await supabase
    .from("characters").select("id, name, style").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!character) return NextResponse.json({ error: "Character not found." }, { status: 404 });

  const { data: lore } = await supabase.from("character_profiles").select("personality").eq("character_id", id).maybeSingle();

  try {
    const ideas = await generateTokenIdeas({ characterName: character.name, style: character.style, personality: lore?.personality || undefined });
    return NextResponse.json({ ideas });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      return NextResponse.json(mapGenerationError(err), { status: statusForGenerationError(err) });
    }
    console.error("[LoreForge] Token idea generation failed:", err);
    return NextResponse.json({ error: "Couldn't generate ideas right now.", code: "GENERATION_FAILED" }, { status: 502 });
  }
}
