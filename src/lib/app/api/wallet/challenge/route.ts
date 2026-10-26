import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { isErrorResponse, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireUser({ needsServiceRole: true });
  if (isErrorResponse(auth)) return auth;

  let body: { walletAddress?: unknown } | null;
  try {
    body = (await request.json()) as { walletAddress?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  if (typeof body?.walletAddress !== "string" || body.walletAddress.length > 64) {
    return NextResponse.json({ error: "Enter a valid Solana wallet address." }, { status: 400 });
  }

  let walletAddress: string;
  try {
    const key = new PublicKey(body.walletAddress);
    walletAddress = key.toBase58();
    if (walletAddress !== body.walletAddress) throw new Error("Non-canonical address");
  } catch {
    return NextResponse.json({ error: "That Solana wallet address is invalid." }, { status: 400 });
  }

  const now = new Date();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
  const nonce = randomUUID();
  const origin = new URL(request.url).origin;
  const message = [
    "LoreForge Wallet Verification",
    "",
    `Domain: ${origin}`,
    "Action: Link this Solana wallet to my LoreForge account.",
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expiresAt}`,
    "",
    "This signature only verifies wallet control. It does not authorize a blockchain transaction.",
  ].join("\n");

  const admin = createAdminClient();
  // Keep challenge storage small. Challenges are single-use and expire after five minutes.
  const { error: cleanupError } = await admin
    .from("wallet_link_challenges")
    .delete()
    .lt("expires_at", now.toISOString());
  if (cleanupError) {
    console.error("[LoreForge] Wallet challenge cleanup failed:", cleanupError.message);
  }

  const { error } = await admin.from("wallet_link_challenges").insert({
    nonce,
    user_id: auth.user.id,
    wallet_address: walletAddress,
    message,
    expires_at: expiresAt,
  });

  if (error) {
    console.error("[LoreForge] Wallet challenge creation failed:", error.message);
    return NextResponse.json({ error: "Couldn't start wallet verification. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ nonce, message, expiresAt }, { headers: { "Cache-Control": "no-store" } });
}