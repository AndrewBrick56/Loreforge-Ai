import { NextResponse } from "next/server";
import { isErrorResponse, requireUser, UUID_RE } from "@/lib/auth";

export const runtime = "nodejs";

/** Toggle the signed-in user's like on a character. The counter is maintained by a database trigger. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth;
  const { supabase, user } = auth;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: existing } = await supabase
    .from("likes").select("character_id").eq("character_id", id).eq("user_id", user.id).maybeSingle();

  let liked: boolean;
  if (existing) {
    const { error } = await supabase.from("likes").delete().eq("character_id", id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: "Couldn't remove your like." }, { status: 500 });
    liked = false;
  } else {
    const { error } = await supabase.from("likes").insert({ user_id: user.id, character_id: id });
    // 42501 = RLS refused (character isn't public/yours); 23503 = it doesn't exist
    if (error && (error.code === "42501" || error.code === "23503")) {
      return NextResponse.json({ error: "Character not found." }, { status: 404 });
    }
    if (error && error.code !== "23505") {
      return NextResponse.json({ error: "Couldn't like this character." }, { status: 500 });
    }
    liked = true; // 23505 = already liked in a race; still liked
  }

  const { data: row } = await supabase.from("characters").select("like_count").eq("id", id).maybeSingle();
  return NextResponse.json({ liked, likeCount: row?.like_count ?? 0 });
}
