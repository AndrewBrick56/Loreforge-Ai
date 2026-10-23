import { NextResponse } from "next/server";
import { checkMintAddressFormat } from "@/lib/solana/mint";
import { getPublicTokenByMint } from "@/lib/tokens/public-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ mint: string }> }) {
  const { mint } = await context.params;
  const format = checkMintAddressFormat(mint);
  if (!format.ok) return NextResponse.json({ error: "Token not found." }, { status: 404 });

  const token = await getPublicTokenByMint(mint);
  if (!token) return NextResponse.json({ error: "Token not found." }, { status: 404 });

  return NextResponse.json(
    { token },
    { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" } },
  );
}
