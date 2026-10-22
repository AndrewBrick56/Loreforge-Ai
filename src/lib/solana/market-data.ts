import "server-only";

/**
 * Live market data via DexScreener's public API (no key required).
 * Endpoint confirmed against DexScreener's own docs (docs.dexscreener.com/api,
 * checked 2026-09): GET /tokens/v1/{chainId}/{tokenAddresses}, rate limit
 * ~300 req/min. This is read-only market data — nothing here executes a
 * trade or interacts with a wallet.
 */
const DEXSCREENER_BASE = "https://api.dexscreener.com";
const FETCH_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 30_000;

export interface TokenMarketData {
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  priceChange24hPct: number | null;
  dexId: string;
  pairUrl: string;
  baseSymbol: string;
  fetchedAt: string;
}

interface DexScreenerPair {
  dexId: string;
  url: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  marketCap?: number;
  fdv?: number;
  priceChange?: { h24?: number };
  baseToken?: { symbol?: string };
}

const cache = new Map<string, { data: TokenMarketData | null; expiresAt: number }>();

/**
 * Returns null when the token has no live pairs (too new / illiquid / this
 * server couldn't reach DexScreener) — the UI should show "market data
 * unavailable", never a fabricated number.
 */
export async function fetchTokenMarketData(mintAddress: string): Promise<TokenMarketData | null> {
  const cached = cache.get(mintAddress);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  let data: TokenMarketData | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${DEXSCREENER_BASE}/tokens/v1/solana/${encodeURIComponent(mintAddress)}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    }).finally(() => clearTimeout(timer));

    if (res.ok) {
      const pairs = (await res.json()) as DexScreenerPair[] | null;
      if (Array.isArray(pairs) && pairs.length > 0) {
        // The most liquid pair is the most representative price.
        const best = pairs.reduce((a, b) => ((b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a));
        data = {
          priceUsd: best.priceUsd ? Number(best.priceUsd) : null,
          liquidityUsd: best.liquidity?.usd ?? null,
          volume24hUsd: best.volume?.h24 ?? null,
          marketCapUsd: best.marketCap ?? null,
          fdvUsd: best.fdv ?? null,
          priceChange24hPct: best.priceChange?.h24 ?? null,
          dexId: best.dexId,
          pairUrl: best.url,
          baseSymbol: best.baseToken?.symbol ?? "",
          fetchedAt: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    console.error("[LoreForge] DexScreener fetch failed:", err instanceof Error ? err.message : err);
    data = null;
  }

  cache.set(mintAddress, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}
