import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { isErrorResponse, requireUser } from "@/lib/auth";
import { checkMintAddressFormat, checkMintOnChain } from "@/lib/solana/mint";
import { resolveSolanaEndpoint, resolveSolanaNetwork } from "@/lib/solana/network";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC_TIMEOUT_MS = 9000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Solana RPC timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function formatTokenAmount(rawAmount: bigint, decimals: number): string {
  const raw = rawAmount.toString();
  if (decimals <= 0) return raw;
  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals).replace(/^0+(?=\d)/, "") || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

type ParsedInfo = {
  mint?: unknown;
  tokenAmount?: { amount?: unknown; decimals?: unknown };
};

type ParsedAccount = {
  account: {
    data: {
      parsed?: { info?: ParsedInfo };
    };
  };
};

export async function POST(request: Request) {
  const auth = await requireUser({ needsServiceRole: true });
  if (isErrorResponse(auth)) return auth;

  let body: { mint?: unknown } | null;
  try {
    body = (await request.json()) as { mint?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  if (typeof body?.mint !== "string" || body.mint.length > 64) {
    return NextResponse.json({ error: "Enter a valid Solana token mint address." }, { status: 400 });
  }

  const mint = body.mint.trim();
  const format = checkMintAddressFormat(mint);
  if (!format.ok) {
    return NextResponse.json({ error: format.reason }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("wallet_address, wallet_verified_at")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[LoreForge] Token holding profile lookup failed:", profileError.message);
    return NextResponse.json({ error: "Couldn't load your verified wallet. Please try again." }, { status: 500 });
  }
  if (!profile?.wallet_address || !profile.wallet_verified_at) {
    return NextResponse.json(
      { error: "Verify and link a wallet to your LoreForge account before checking token holdings." },
      { status: 409 },
    );
  }

  const mintCheck = await checkMintOnChain(mint);
  if (mintCheck.status === "not_a_mint") {
    return NextResponse.json({ error: mintCheck.reason }, { status: 400 });
  }
  if (mintCheck.status === "unverifiable") {
    return NextResponse.json({ error: mintCheck.reason }, { status: 503 });
  }

  try {
    const connection = new Connection(resolveSolanaEndpoint(), "confirmed");
    const owner = new PublicKey(profile.wallet_address);
    const mintKey = new PublicKey(mint);
    const response = await withTimeout(
      connection.getParsedTokenAccountsByOwner(owner, { mint: mintKey }, "confirmed"),
      RPC_TIMEOUT_MS,
    );

    let totalRawAmount = BigInt(0);
    let decimals = mintCheck.decimals;
    let matchedAccounts = 0;

    for (const item of response.value as unknown as ParsedAccount[]) {
      const info = item.account.data.parsed?.info;
      if (info?.mint !== mint) continue;

      const amount = info.tokenAmount?.amount;
      const accountDecimals = info.tokenAmount?.decimals;
      if (typeof amount !== "string" || !/^\d+$/.test(amount)) continue;
      if (typeof accountDecimals !== "number" || !Number.isInteger(accountDecimals) || accountDecimals < 0 || accountDecimals > 255) continue;

      totalRawAmount += BigInt(amount);
      decimals = accountDecimals;
      matchedAccounts++;
    }

    return NextResponse.json(
      {
        mint,
        network: resolveSolanaNetwork(),
        hasBalance: totalRawAmount > BigInt(0),
        amount: formatTokenAmount(totalRawAmount, decimals),
        decimals,
        tokenAccountsCount: matchedAccounts,
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (caught) {
    console.error(
      "[LoreForge] Token holding check failed:",
      caught instanceof Error ? caught.message : "Unknown RPC error",
    );
    return NextResponse.json(
      { error: "Couldn't check token holdings on Solana right now. Please refresh and try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}