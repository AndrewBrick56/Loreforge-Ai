import { NextResponse } from "next/server";
import { z } from "zod";

import { isErrorResponse, requireUser, UUID_RE } from "@/lib/auth";
import { getLaunchpadById } from "@/lib/launchpads/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_COLUMNS =
  "id, owner_id, character_id, project_name, ticker, tagline, description, x_post, telegram_welcome, selected_launchpad_id, status, created_at, updated_at";

const SaveProjectSchema = z
  .object({
    projectId: z.string().uuid().nullable().optional(),
    characterId: z.string().uuid(),
    projectName: z.string().trim().min(1).max(80),
    ticker: z.string().regex(/^[A-Z0-9]{3,6}$/),
    tagline: z.string().max(160),
    description: z.string().max(2500),
    xPost: z.string().max(2000),
    telegramWelcome: z.string().max(2000),
    selectedLaunchpadId: z.string().nullable().optional(),
  })
  .refine(
    (value) =>
      !value.selectedLaunchpadId ||
      Boolean(getLaunchpadById(value.selectedLaunchpadId)),
    {
      path: ["selectedLaunchpadId"],
      message: "Select a supported launchpad.",
    },
  );

export async function GET(req: Request) {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth;

  const characterId = new URL(req.url).searchParams.get("characterId");

  if (!characterId || !UUID_RE.test(characterId)) {
    return NextResponse.json(
      { error: "A valid character ID is required." },
      { status: 400 },
    );
  }

  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("launch_projects")
    .select(PROJECT_COLUMNS)
    .eq("owner_id", user.id)
    .eq("character_id", characterId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[LoreForge] Could not load launch project:", error.message);
    return NextResponse.json(
      { error: "Couldn't load this project." },
      { status: 503 },
    );
  }

  return NextResponse.json({ project: data });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth;

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const parsed = SaveProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the project name, ticker and other fields.",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const { supabase, user } = auth;

  // Verify ownership of the referenced character before saving.
  const { data: character, error: characterError } = await supabase
    .from("characters")
    .select("id")
    .eq("id", input.characterId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (characterError) {
    console.error(
      "[LoreForge] Launch project character lookup failed:",
      characterError.message,
    );
    return NextResponse.json(
      { error: "Couldn't verify the selected character." },
      { status: 503 },
    );
  }

  if (!character) {
    return NextResponse.json(
      { error: "Character not found." },
      { status: 404 },
    );
  }

  const values = {
    character_id: input.characterId,
    project_name: input.projectName,
    ticker: input.ticker,
    tagline: input.tagline,
    description: input.description,
    x_post: input.xPost,
    telegram_welcome: input.telegramWelcome,
    selected_launchpad_id: input.selectedLaunchpadId || null,
    updated_at: new Date().toISOString(),
  };

  if (input.projectId) {
    const { data, error } = await supabase
      .from("launch_projects")
      .update(values)
      .eq("id", input.projectId)
      .eq("owner_id", user.id)
      .select(PROJECT_COLUMNS)
      .maybeSingle();

    if (error) {
      console.error("[LoreForge] Launch project update failed:", error.message);
      return NextResponse.json(
        { error: "Couldn't save your project." },
        { status: 503 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Saved project not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ project: data });
  }

  const { data, error } = await supabase
    .from("launch_projects")
    .insert({
      ...values,
      owner_id: user.id,
      status: "draft",
    })
    .select(PROJECT_COLUMNS)
    .single();

  if (error) {
    console.error("[LoreForge] Launch project creation failed:", error.message);
    return NextResponse.json(
      { error: "Couldn't create the saved project." },
      { status: 503 },
    );
  }

  return NextResponse.json({ project: data }, { status: 201 });
}
