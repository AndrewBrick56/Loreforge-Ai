import "server-only";
import type { TokenMarketData } from "@/lib/tokens/types";

/**
 * Read-only market data for an existing Solana token.
 * Data is sourced from DexScreener; it never signs transactions or trades.
 */
const API_BASE = "https://api.dexscreener.com";
const FETCH_TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 30_000;

interface DexScreenerPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  priceUsd?: string | null;
  liquidity?: { usd?: number | null } | null;
  volume?: { h24?: number | null } | null;
  marketCap?: number | null;
  fdv?: number | null;
  priceChange?: { h24?: number | null } | null;
  txns?: { h24?: { buys?: number | null; sells?: number | null } | null } | null;
  baseToken?: { symbol?: string | null } | null;
}

type CacheValue = { data: TokenMarketData | null; expiresAt: number };
const cache = new Map<string, CacheValue>();

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safePairUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "dexscreener.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function buildEmbedUrl(pairAddress: string): string {
  const query = new URLSearchParams({
    embed: "1",
    loadChartSettings: "0",
    trades: "0",
    info: "0",
    chartLeftToolbar: "0",
    theme: "dark",
    chartTheme: "dark",
    chartStyle: "1",
    interval: "15",
    chartType: "price",
  });
  return `https://dexscreener.com/solana/${encodeURIComponent(pairAddress)}?${query.toString()}`;
}

/** Returns null when there is no public market pair or the market data source is unavailable. */
export async function fetchDetailedTokenMarketData(mintAddress: string): Promise<TokenMarketData | null> {
  const cached = cache.get(mintAddress);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  let market: TokenMarketData | null = null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${API_BASE}/tokens/v1/solana/${encodeURIComponent(mintAddress)}`,
      { signal: controller.signal, headers: { Accept: "application/json" }, cache: "no-store" },
    );

    if (response.ok) {
      const payload: unknown = await response.json();
      const pairs = Array.isArray(payload) ? (payload as DexScreenerPair[]) : [];
      const solanaPairs = pairs.filter(
        (pair) => pair.chainId === "solana" && typeof pair.pairAddress === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pair.pairAddress),
      );
      const usable = solanaPairs
        .map((pair) => ({ pair, url: safePairUrl(pair.url) }))
        .filter((item): item is { pair: DexScreenerPair; url: string } => Boolean(item.url));

      if (usable.length > 0) {
        // Prefer the pool with the greatest known liquidity for a more representative quote.
        const selected = usable.reduce((best, candidate) =>
          (candidate.pair.liquidity?.usd ?? 0) > (best.pair.liquidity?.usd ?? 0) ? candidate : best,
        );
        const pair = selected.pair;
        const pairAddress = pair.pairAddress!;

        market = {
          chainId: "solana",
          pairAddress,
          priceUsd: finiteNumber(pair.priceUsd),
          liquidityUsd: finiteNumber(pair.liquidity?.usd),
          volume24hUsd: finiteNumber(pair.volume?.h24),
          marketCapUsd: finiteNumber(pair.marketCap),
          fdvUsd: finiteNumber(pair.fdv),
          priceChange24hPct: finiteNumber(pair.priceChange?.h24),
          buys24h: finiteNumber(pair.txns?.h24?.buys),
          sells24h: finiteNumber(pair.txns?.h24?.sells),
          dexId: typeof pair.dexId === "string" ? pair.dexId.slice(0, 80) : "DEX",
          pairUrl: selected.url,
          chartEmbedUrl: buildEmbedUrl(pairAddress),
          baseSymbol: typeof pair.baseToken?.symbol === "string" ? pair.baseToken.symbol.slice(0, 30) : "",
          fetchedAt: new Date().toISOString(),
        };
      }
    }
  } catch (error) {
    console.error(
      "[LoreForge] Detailed token market lookup failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
  } finally {
    clearTimeout(timeout);
  }

  cache.set(mintAddress, { data: market, expiresAt: Date.now() + CACHE_TTL_MS });
  return market;
}
