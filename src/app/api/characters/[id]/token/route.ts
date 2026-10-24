import { NextResponse } from "next/server";
import { z } from "zod";
import { isErrorResponse, requireUser, UUID_RE, getServerUser } from "@/lib/auth";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { checkMintAddressFormat, checkMintOnChain } from "@/lib/solana/mint";
import { fetchTokenMarketData } from "@/lib/solana/market-data";

export const runtime = "nodejs";

const bodySchema = z.object({
  mintAddress: z.string().trim().min(32).max(44),
  tokenName: z.string().trim().max(80).optional(),
  tokenTicker: z
    .string()
    .trim()
    .toUpperCase()
    .max(15)
    .transform((s) => s.replace(/^\$/, ""))
    .optional(),
  launchpadId: z.enum(["pump-fun", "raydium-launchlab"]).nullable().optional(),
});

/**
 * Associate an EXISTING Solana token with a character the user owns.
 * This is informational, not proof of ownership of the token itself —
 * wallet-signature-verified ownership is a later stage. What IS real here:
 * the mint address is validated both by format and, best-effort, on-chain.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser({ needsServiceRole: true });
  if (isErrorResponse(auth)) return auth;
  const { supabase, user } = auth;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Character not found." }, { status: 404 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Enter a valid-looking Solana token address.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const { data: owns } = await supabase.from("characters").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!owns) return NextResponse.json({ error: "Character not found." }, { status: 404 });

  const format = checkMintAddressFormat(body.mintAddress);
  if (!format.ok) {
    return NextResponse.json({ error: format.reason, code: "INVALID_FORMAT" }, { status: 400 });
  }

  const onChain = await checkMintOnChain(body.mintAddress);
  if (onChain.status === "not_a_mint") {
    return NextResponse.json({ error: onChain.reason, code: "NOT_A_MINT" }, { status: 400 });
  }
  const verified = onChain.status === "verified";
  const decimals = onChain.status === "verified" ? onChain.decimals : null;

  // Written entirely through the admin client — verified_on_chain has no
  // client-facing grant at all (see migration 002), so this route is the
  // only place that can ever set it, and it always sets it explicitly.
  const admin = createAdminClient();
  const { error } = await admin.from("character_tokens").upsert(
    {
      character_id: id,
      mint_address: body.mintAddress,
      token_name: body.tokenName || null,
      token_ticker: body.tokenTicker || null,
      launchpad_id: body.launchpadId ?? null,
      decimals,
      verified_on_chain: verified,
      associated_by: user.id,
    },
    { onConflict: "character_id" }
  );

  if (error) {
    console.error("[LoreForge] Token association failed:", error.message);
    return NextResponse.json({ error: "Couldn't save that token association.", code: "DB_ERROR" }, { status: 500 });
  }

  // Link the token mint to the latest Launch Kit project for this same character.
  // Do not change project status: a mint association alone does not prove launch or ownership.
  let launchProjectLinked = false;
  let launchProjectSyncWarning: string | undefined;
  const { data: launchProject, error: launchProjectLookupError } = await admin
    .from("launch_projects")
    .select("id")
    .eq("character_id", id)
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (launchProjectLookupError) {
    console.error("[LoreForge] Launch Kit token link lookup failed:", launchProjectLookupError.message);
    launchProjectSyncWarning = "The token was saved, but the Launch Kit project could not be linked.";
  } else if (launchProject) {
    const { error: launchProjectUpdateError } = await admin
      .from("launch_projects")
      .update({ token_mint_address: body.mintAddress, updated_at: new Date().toISOString() })
      .eq("id", launchProject.id)
      .eq("owner_id", user.id);

    if (launchProjectUpdateError) {
      console.error("[LoreForge] Launch Kit token link update failed:", launchProjectUpdateError.message);
      launchProjectSyncWarning = "The token was saved, but the Launch Kit project could not be linked.";
    } else {
      launchProjectLinked = true;
    }
  }

  return NextResponse.json({
    ok: true,
    verifiedOnChain: verified,
    launchProjectLinked,
    launchProjectSyncWarning,
    warning: onChain.status === "unverifiable" ? onChain.reason : undefined,
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth;
  const { supabase, user } = auth;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Character not found." }, { status: 404 });

  const { data: owns } = await supabase.from("characters").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!owns) return NextResponse.json({ error: "Character not found." }, { status: 404 });

  const { data: currentToken } = await supabase
    .from("character_tokens")
    .select("mint_address")
    .eq("character_id", id)
    .maybeSingle();

  const { error } = await supabase.from("character_tokens").delete().eq("character_id", id);
  if (error) return NextResponse.json({ error: "Couldn't remove the token association.", code: "DB_ERROR" }, { status: 500 });

  if (currentToken?.mint_address && hasServiceRole()) {
    const admin = createAdminClient();
    const { error: unlinkError } = await admin
      .from("launch_projects")
      .update({ token_mint_address: null, updated_at: new Date().toISOString() })
      .eq("character_id", id)
      .eq("owner_id", user.id)
      .eq("token_mint_address", currentToken.mint_address);
    if (unlinkError) {
      // The token association was successfully removed; log, but don't turn it into a failed delete.
      console.error("[LoreForge] Launch Kit token unlink failed:", unlinkError.message);
    }
  }

  return NextResponse.json({ ok: true });
}

/** Live market data for a character's associated token, if any. Never cached in the database — always fetched fresh (with a short in-process cache). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isSupabaseConfigured() || !hasServiceRole()) return NextResponse.json({ token: null, market: null });

  const admin = createAdminClient();
  const { data: character } = await admin.from("characters").select("id, is_public, owner_id").eq("id", id).maybeSingle();
  if (!character) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (!character.is_public) {
    const { user } = await getServerUser().catch(() => ({ user: null }));
    if (!user || user.id !== character.owner_id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: token } = await admin
    .from("character_tokens")
    .select("mint_address, token_name, token_ticker, launchpad_id, verified_on_chain, decimals")
    .eq("character_id", id)
    .maybeSingle();
  if (!token) return NextResponse.json({ token: null, market: null });

  const market = await fetchTokenMarketData(token.mint_address);
  return NextResponse.json({ token, market });
}
