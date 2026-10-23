"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, ExternalLink, Loader2, ShieldCheck, ShieldQuestion, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

interface TokenInfo {
  mint_address: string;
  token_name: string | null;
  token_ticker: string | null;
  launchpad_id: "pump-fun" | "raydium-launchlab" | null;
  verified_on_chain: boolean;
  decimals: number | null;
}
interface MarketData {
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  priceChange24hPct: number | null;
  dexId: string;
  pairUrl: string;
}

function fmtUsd(n: number | null): string {
  if (n === null) return "—";
  if (n < 0.01) return `$${n.toPrecision(2)}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: n < 1000 ? 4 : 0 })}`;
}

export function TokenPanel({ characterId, isOwner }: { characterId: string; isOwner: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);

  const [editing, setEditing] = useState(false);
  const [mintInput, setMintInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [tickerInput, setTickerInput] = useState("");
  const [launchpadInput, setLaunchpadInput] = useState<"" | "pump-fun" | "raydium-launchlab">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/characters/${characterId}/token`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setToken(data.token ?? null);
        setMarket(data.market ?? null);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  async function associate() {
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mintAddress: mintInput.trim(), tokenName: nameInput.trim() || undefined, tokenTicker: tickerInput.trim() || undefined, launchpadId: launchpadInput || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't validate that address.");
        return;
      }
      if (data.warning) setWarning(data.warning);
      setEditing(false);
      router.refresh();
      const refreshed = await fetch(`/api/characters/${characterId}/token`).then((r) => r.json());
      setToken(refreshed.token ?? null);
      setMarket(refreshed.market ?? null);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this token association?")) return;
    setBusy(true);
    try {
      await fetch(`/api/characters/${characterId}/token`, { method: "DELETE" });
      setToken(null);
      setMarket(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  if (!token && !isOwner) return null;

  return (
    <GlassCard hover={false} className="space-y-3">
      <div className="flex items-center gap-2">
        <Coins size={16} className="text-lf-cyan" />
        <h2 className="font-display text-base font-bold">Token</h2>
      </div>

      {!token && !editing && isOwner && (
        <div>
          <p className="text-sm text-lf-text-dim">Link this character to an existing Solana token you own.</p>
          <Button variant="secondary" className="mt-2" onClick={() => setEditing(true)}>Associate a token</Button>
        </div>
      )}

      {editing && (
        <div className="space-y-2">
          <input value={mintInput} onChange={(e) => setMintInput(e.target.value)} placeholder="Token mint address"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs placeholder:font-sans placeholder:text-lf-text-faint focus:border-lf-purple-light focus:outline-none" />
          <div className="flex gap-2">
            <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={80} placeholder="Token name (optional)"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm placeholder:text-lf-text-faint focus:border-lf-purple-light focus:outline-none" />
            <input value={tickerInput} onChange={(e) => setTickerInput(e.target.value.toUpperCase())} maxLength={15} placeholder="TICKER"
              className="w-28 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm placeholder:text-lf-text-faint focus:border-lf-purple-light focus:outline-none" />
          </div>
          <div>
            <label htmlFor="token-trading-platform" className="mb-1 block text-xs text-lf-text-dim">Trading destination</label>
            <select
              id="token-trading-platform"
              value={launchpadInput}
              onChange={(event) => setLaunchpadInput(event.target.value as "" | "pump-fun" | "raydium-launchlab")}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-lf-text focus:border-lf-purple-light focus:outline-none"
            >
              <option value="">No specific platform â€” use market link only</option>
              <option value="pump-fun">Pump.fun</option>
              <option value="raydium-launchlab">Raydium Swap</option>
            </select>
            <p className="mt-1 text-[11px] text-lf-text-faint">Choose where this existing token is traded. This does not prove token ownership.</p>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button variant="primary" onClick={associate} disabled={!mintInput.trim() || busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : "Validate & save"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {token && !editing && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-display text-sm font-bold">
                {token.token_name || "Unnamed token"} {token.token_ticker && <span className="text-lf-purple-light">${token.token_ticker}</span>}
              </p>
              <p className="mt-0.5 break-all font-mono text-[11px] text-lf-text-faint">{token.mint_address}</p>
            </div>
          </div>

          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs w-fit ${token.verified_on_chain ? "bg-lf-cyan/15 text-lf-cyan" : "bg-white/5 text-lf-text-faint"}`}>
            {token.verified_on_chain ? <ShieldCheck size={12} /> : <ShieldQuestion size={12} />}
            {token.verified_on_chain ? "Verified on-chain" : "Not verified on-chain"}
          </div>
          {warning && <p className="text-xs text-amber-300">{warning}</p>}
          {!token.verified_on_chain && (
            <p className="text-xs text-lf-text-faint">
              This is a creator-declared association, not proof of ownership. It couldn&apos;t be confirmed on-chain{isOwner ? " when it was saved" : ""}.
            </p>
          )}

          {market ? (
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/20 p-3 text-sm sm:grid-cols-4">
              <div><p className="text-[11px] text-lf-text-faint">Price</p><p className="font-medium">{fmtUsd(market.priceUsd)}</p></div>
              <div><p className="text-[11px] text-lf-text-faint">24h</p><p className={`font-medium ${(market.priceChange24hPct ?? 0) >= 0 ? "text-lf-cyan" : "text-red-400"}`}>{market.priceChange24hPct === null ? "—" : `${market.priceChange24hPct.toFixed(1)}%`}</p></div>
              <div><p className="text-[11px] text-lf-text-faint">Liquidity</p><p className="font-medium">{fmtUsd(market.liquidityUsd)}</p></div>
              <div><p className="text-[11px] text-lf-text-faint">Mkt cap</p><p className="font-medium">{fmtUsd(market.marketCapUsd)}</p></div>
            </div>
          ) : (
            <p className="text-xs text-lf-text-faint">No live market data found yet — this token may not be trading on a DEX.</p>
          )}

          <div className="flex flex-wrap gap-2">
            {token.launchpad_id === "pump-fun" && (
              <a href={`https://pump.fun/?outputCurrency=${encodeURIComponent(token.mint_address)}`} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" className="px-3 py-1.5 text-xs"><ExternalLink size={12} /> Trade on Pump.fun</Button>
              </a>
            )}
            {token.launchpad_id === "raydium-launchlab" && (
              <a href={`https://raydium.io/swap/?inputMint=sol&outputMint=${encodeURIComponent(token.mint_address)}`} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" className="px-3 py-1.5 text-xs"><ExternalLink size={12} /> Trade on Raydium</Button>
              </a>
            )}
            {market && (
              <a href={market.pairUrl} target="_blank" rel="noreferrer">
                <Button variant="secondary" className="px-3 py-1.5 text-xs"><ExternalLink size={12} /> View on {market.dexId}</Button>
              </a>
            )}
            {isOwner && (
              <>
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => { setMintInput(token.mint_address); setNameInput(token.token_name ?? ""); setTickerInput(token.token_ticker ?? ""); setLaunchpadInput(token.launchpad_id ?? ""); setEditing(true); }}>
                  Edit
                </Button>
                <button onClick={remove} disabled={busy} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-red-300/80 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50 cursor-pointer">
                  <Trash2 size={12} /> Remove
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
