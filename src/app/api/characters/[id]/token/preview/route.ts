import { NextResponse } from "next/server";
import { z } from "zod";
import { isErrorResponse, requireUser, UUID_RE } from "@/lib/auth";
import { checkMintAddressFormat } from "@/lib/solana/mint";
import { fetchDetailedTokenMarketData } from "@/lib/tokens/market-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const previewSchema = z.object({
  mintAddress: z.string().trim().min(32).max(44),
});

/**
 * Preview existing public market data without saving or publishing a token.
 * Access is restricted to an authenticated owner of the character.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth;
  const { supabase, user } = auth;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Character not found." }, { status: 404 });
  }

  const { data: character } = await supabase
    .from("characters")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!character) {
    return NextResponse.json({ error: "Character not found." }, { status: 404 });
  }

  let body: z.infer<typeof previewSchema>;
  try {
    body = previewSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter a valid-looking Solana token mint address." }, { status: 400 });
  }

  const format = checkMintAddressFormat(body.mintAddress);
  if (!format.ok) {
    return NextResponse.json({ error: format.reason }, { status: 400 });
  }

  const market = await fetchDetailedTokenMarketData(body.mintAddress);
  return NextResponse.json(
    {
      market,
      message: market ? undefined : "No public DEX market pair was found for this mint yet. It may be new, illiquid, or not tracked by DexScreener.",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}