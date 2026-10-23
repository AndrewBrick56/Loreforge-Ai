"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ChartNoAxesCombined, Coins, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import type { PublicTokenDTO, TokenMarketData } from "@/lib/tokens/types";
import { GlassCard } from "@/components/ui/glass-card";

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "â€”";
  if (value !== 0 && Math.abs(value) < 0.0001) return `$${value.toExponential(2)}`;
  if (Math.abs(value) < 0.01) return `$${value.toPrecision(3)}`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: Math.abs(value) < 1000 ? 4 : 0 })}`;
}

function integer(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "â€”" : Math.round(value).toLocaleString();
}

function percent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "â€”";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs text-lf-text-faint">{label}</p>
      <p className="mt-2 break-words font-display text-lg font-bold sm:text-xl">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-lf-text-faint">{hint}</p>}
    </div>
  );
}

export function TokenDetailView({ mintAddress }: { mintAddress: string }) {
  const [token, setToken] = useState<PublicTokenDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(isRefresh = false, signal?: AbortSignal) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tokens/${encodeURIComponent(mintAddress)}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Token not found.");
      setToken(data.token as PublicTokenDTO);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Couldn't load this token.");
      setToken(null);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) queueMicrotask(() => {
      if (!controller.signal.aborted) void load(false, controller.signal);
    });
    });
    return () => controller.abort();
    // Load once per mint address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintAddress]);

  if (loading) {
    return <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-20 text-sm text-lf-text-dim"><LoaderCircle size={18} className="animate-spin" /> Loading token detailsâ€¦</div>;
  }

  if (!token || error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <GlassCard hover={false} className="py-12 text-center">
          <Coins size={32} className="mx-auto text-lf-purple-light" />
          <h1 className="mt-4 font-display text-xl font-bold">Token unavailable</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-lf-text-dim">{error || "This token may not be associated with a public LoreForge character."}</p>
          <Link href="/tokens" className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"><ArrowLeft size={15} /> Back to tokens</Link>
        </GlassCard>
      </div>
    );
  }

  const market: TokenMarketData | null = token.market ?? null;
  const change = market?.priceChange24hPct;
  const marketLink = market?.pairUrl ?? null;
  const tradePlatform = token.launchpadId === "pump-fun" ? "Pump.fun" : token.launchpadId === "raydium-launchlab" ? "Raydium" : null;
  const tradeUrl = token.launchpadId === "pump-fun"
    ? `https://pump.fun/?outputCurrency=${encodeURIComponent(token.mintAddress)}`
    : token.launchpadId === "raydium-launchlab"
      ? `https://raydium.io/swap/?inputMint=sol&outputMint=${encodeURIComponent(token.mintAddress)}`
      : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/tokens" className="inline-flex items-center gap-2 text-sm text-lf-text-dim hover:text-white"><ArrowLeft size={15} /> All tokens</Link>
        <button disabled={refreshing} onClick={() => void load(true)} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs text-lf-text-dim hover:bg-white/5 disabled:opacity-50"><RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh data</button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div className="space-y-6">
          <GlassCard hover={false} className="overflow-hidden">
            <div className="grid gap-5 sm:grid-cols-[160px_minmax(0,1fr)]">
              <div className="aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/30">
                {token.character.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={token.character.coverUrl} alt={token.character.name} className="h-full w-full object-cover" />
                ) : <div className="grid h-full place-items-center"><Coins size={36} className="text-lf-text-faint" /></div>}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lf-cyan">Solana token Â· LoreForge character</p>
                <h1 className="mt-2 break-words font-display text-2xl font-bold sm:text-3xl">{token.tokenName || token.character.name}</h1>
                <p className="mt-1 text-sm text-lf-purple-light">{token.tokenTicker ? `$${token.tokenTicker.replace(/^\$/, "")}` : "Ticker not provided"}</p>
                <p className="mt-3 text-sm text-lf-text-dim">Character: <Link href={`/c/${token.character.id}`} className="text-lf-cyan hover:underline">{token.character.name}</Link></p>
                {token.character.lore.title && <p className="mt-2 text-sm text-lf-text-dim">{token.character.lore.title}</p>}
                {token.character.lore.catchphrase && <p className="mt-3 text-sm italic text-lf-text-faint">â€œ{token.character.lore.catchphrase}â€</p>}
                <p className="mt-4 break-all font-mono text-xs text-lf-text-faint">Mint: {token.mintAddress}</p>
                <p className="mt-2 text-xs text-lf-text-faint">Character creator: {token.character.creatorDisplayName}</p>
                <p className="mt-3 text-xs text-lf-text-faint">{token.verifiedOnChain ? "Mint verified on-chain when associated" : "On-chain verification was unavailable when associated"}. This association does not prove ownership of the token.</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard hover={false} className="p-0">
            <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4"><ChartNoAxesCombined size={17} className="text-lf-cyan" /><h2 className="font-display font-bold">Price chart</h2>{market && <span className="ml-auto text-xs text-lf-text-faint">{market.dexId}</span>}</div>
            {market?.chartEmbedUrl ? (
              <iframe title={`${token.tokenName || token.character.name} price chart`} src={market.chartEmbedUrl} loading="lazy" className="h-[360px] w-full border-0 sm:h-[460px]" referrerPolicy="no-referrer" allow="clipboard-write" />
            ) : (
              <div className="grid min-h-64 place-items-center px-6 py-12 text-center">
                <div><ChartNoAxesCombined size={28} className="mx-auto text-lf-text-faint" /><p className="mt-3 font-semibold">Chart not available yet</p><p className="mt-1 max-w-sm text-sm text-lf-text-faint">The token may not have a market pair indexed by DexScreener yet.</p></div>
              </div>
            )}
          </GlassCard>

          {(token.character.lore.personality || token.character.lore.originStory) && (
            <GlassCard hover={false} className="space-y-3">
              <h2 className="font-display font-bold">Character lore</h2>
              {token.character.lore.personality && <p className="text-sm leading-relaxed text-lf-text-dim">{token.character.lore.personality}</p>}
              {token.character.lore.originStory && <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-lf-text-faint">Origin story</p><p className="text-sm leading-relaxed text-lf-text-dim">{token.character.lore.originStory}</p></div>}
            </GlassCard>
          )}
        </div>

        <aside className="space-y-5">
          <GlassCard hover={false} className="space-y-4">
            <div><p className="text-xs uppercase tracking-wide text-lf-text-faint">Current price</p><p className="mt-1 font-display text-3xl font-bold">{money(market?.priceUsd)}</p><p className={`mt-1 text-sm ${change == null ? "text-lf-text-faint" : change > 0 ? "text-emerald-400" : change < 0 ? "text-rose-400" : "text-lf-text-dim"}`}>{percent(change)} <span className="text-xs text-lf-text-faint">over 24h</span></p></div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Market cap" value={money(market?.marketCapUsd)} />
              <Stat label="FDV" value={money(market?.fdvUsd)} />
              <Stat label="Liquidity" value={money(market?.liquidityUsd)} />
              <Stat label="24h volume" value={money(market?.volume24hUsd)} />
              <Stat label="24h buys" value={integer(market?.buys24h)} />
              <Stat label="24h sells" value={integer(market?.sells24h)} />
            </div>
            {!market && <p className="text-xs leading-relaxed text-lf-text-faint">Live market data is currently unavailable. We do not estimate or fabricate missing values.</p>}
            {market?.fetchedAt && <p className="text-[11px] text-lf-text-faint">Data fetched {new Date(market.fetchedAt).toLocaleTimeString()}</p>}
            {tradeUrl && tradePlatform && <a href={tradeUrl} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-lf-purple px-4 py-3 text-sm font-semibold hover:bg-lf-violet">Buy / sell on {tradePlatform} <ExternalLink size={15} /></a>}
            {marketLink && <a href={marketLink} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold hover:border-lf-cyan/50 hover:bg-white/5">View market on DexScreener <ExternalLink size={15} /></a>}
            <p className="text-[11px] leading-relaxed text-lf-text-faint">Buy and sell actions happen on external platforms, not inside LoreForge. Market data may be delayed or unavailable, and crypto assets can lose all value.</p>
          </GlassCard>

          <GlassCard hover={false} className="space-y-3">
            <h2 className="font-display font-bold">Token address</h2>
            <p className="break-all font-mono text-xs text-lf-text-dim">{token.mintAddress}</p>
            <button onClick={() => void navigator.clipboard.writeText(token.mintAddress)} className="w-full rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/5">Copy mint address</button>
            <a href={`https://solscan.io/token/${encodeURIComponent(token.mintAddress)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-lf-cyan hover:underline">View on Solscan <ArrowUpRight size={13} /></a>
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}


