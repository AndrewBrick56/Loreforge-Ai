import { createPublicKey, verify as verifyEd25519Signature } from "node:crypto";
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { isErrorResponse, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireUser({ needsServiceRole: true });
  if (isErrorResponse(auth)) return auth;

  let body: { nonce?: unknown; walletAddress?: unknown; signatureBase64?: unknown } | null;
  try {
    body = (await request.json()) as {
      nonce?: unknown;
      walletAddress?: unknown;
      signatureBase64?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  if (
    typeof body?.nonce !== "string" || !UUID_RE.test(body.nonce) ||
    typeof body.walletAddress !== "string" || body.walletAddress.length > 64 ||
    typeof body.signatureBase64 !== "string" || body.signatureBase64.length > 128
  ) {
    return NextResponse.json({ error: "The wallet verification request is invalid." }, { status: 400 });
  }

  let walletAddress: string;
  let publicKeyBytes: Buffer;
  try {
    const key = new PublicKey(body.walletAddress);
    walletAddress = key.toBase58();
    if (walletAddress !== body.walletAddress) throw new Error("Non-canonical address");
    publicKeyBytes = Buffer.from(key.toBytes());
  } catch {
    return NextResponse.json({ error: "That Solana wallet address is invalid." }, { status: 400 });
  }

  const signature = Buffer.from(body.signatureBase64, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== body.signatureBase64) {
    return NextResponse.json({ error: "The wallet signature format is invalid." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: challenge, error: lookupError } = await admin
    .from("wallet_link_challenges")
    .select("nonce, user_id, wallet_address, message, expires_at, consumed_at")
    .eq("nonce", body.nonce)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (lookupError) {
    console.error("[LoreForge] Wallet challenge lookup failed:", lookupError.message);
    return NextResponse.json({ error: "Couldn't verify the wallet request. Please try again." }, { status: 500 });
  }
  if (!challenge) {
    return NextResponse.json({ error: "Wallet challenge not found. Start verification again." }, { status: 404 });
  }
  if (challenge.consumed_at) {
    return NextResponse.json({ error: "This wallet challenge has already been used. Start again." }, { status: 409 });
  }
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Wallet challenge expired. Start verification again." }, { status: 410 });
  }
  if (challenge.wallet_address !== walletAddress) {
    return NextResponse.json({ error: "The signed wallet doesn't match this challenge." }, { status: 400 });
  }

  let signatureIsValid = false;
  try {
    // Solana public keys are raw 32-byte Ed25519 keys; wrap as an SPKI key for Node crypto.
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const keyObject = createPublicKey({
      key: Buffer.concat([spkiPrefix, publicKeyBytes]),
      format: "der",
      type: "spki",
    });
    signatureIsValid = verifyEd25519Signature(
      null,
      Buffer.from(challenge.message, "utf8"),
      keyObject,
      signature,
    );
  } catch {
    signatureIsValid = false;
  }

  if (!signatureIsValid) {
    return NextResponse.json({ error: "Wallet signature verification failed. No wallet was linked." }, { status: 401 });
  }

  const now = new Date().toISOString();
  // Consume the nonce atomically so the same proof cannot be replayed.
  const { data: consumed, error: consumeError } = await admin
    .from("wallet_link_challenges")
    .update({ consumed_at: now })
    .eq("nonce", body.nonce)
    .eq("user_id", auth.user.id)
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("nonce")
    .maybeSingle();

  if (consumeError) {
    console.error("[LoreForge] Wallet challenge consumption failed:", consumeError.message);
    return NextResponse.json({ error: "Couldn't complete wallet verification. Please start again." }, { status: 500 });
  }
  if (!consumed) {
    return NextResponse.json({ error: "This wallet challenge is expired or already used. Start again." }, { status: 409 });
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .update({ wallet_address: walletAddress, wallet_verified_at: now })
    .eq("id", auth.user.id)
    .select("id")
    .maybeSingle();

  if (profileError) {
    if (profileError.code === "23505") {
      return NextResponse.json({ error: "This wallet is already linked to another LoreForge account." }, { status: 409 });
    }
    console.error("[LoreForge] Verified wallet could not be saved:", profileError.message);
    return NextResponse.json({ error: "The wallet was verified, but couldn't be linked to this account." }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "Your LoreForge profile wasn't found. Please sign in again." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, walletAddress, walletVerifiedAt: now }, { headers: { "Cache-Control": "no-store" } });
}