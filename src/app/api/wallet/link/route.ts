import { NextResponse } from "next/server";
import { isErrorResponse, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser({ needsServiceRole: true });
  if (isErrorResponse(auth)) return auth;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("wallet_address, wallet_verified_at")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) {
    console.error("[LoreForge] Linked wallet lookup failed:", error.message);
    return NextResponse.json({ error: "Couldn't load your linked wallet." }, { status: 500 });
  }

  return NextResponse.json({
    walletAddress: data?.wallet_address ?? null,
    walletVerifiedAt: data?.wallet_verified_at ?? null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  const auth = await requireUser({ needsServiceRole: true });
  if (isErrorResponse(auth)) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ wallet_address: null, wallet_verified_at: null })
    .eq("id", auth.user.id);

  if (error) {
    console.error("[LoreForge] Wallet unlink failed:", error.message);
    return NextResponse.json({ error: "Couldn't unlink this wallet. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}