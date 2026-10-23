"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Coins, LoaderCircle, Search, Sparkles, UserRound } from "lucide-react";
import type { PublicTokenDTO } from "@/lib/tokens/types";
import { GlassCard } from "@/components/ui/glass-card";

function shortAddress(value: string): string {
  return `${value.slice(0, 5)}…${value.slice(-5)}`;
}

export function TokenDirectory() {
  const [tokens, setTokens] = useState<PublicTokenDTO[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/tokens?limit=100", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Couldn't load tokens.");
        return data as { tokens?: PublicTokenDTO[] };
      })
      .then((data) => setTokens(Array.isArray(data.tokens) ? data.tokens : []))
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Couldn't load tokens.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const visibleTokens = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return tokens;
    return tokens.filter((token) => [
      token.tokenName,
      token.tokenTicker,
      token.character.name,
      token.character.lore.title,
      token.mintAddress,
    ].some((value) => value?.toLowerCase().includes(needle)));
  }, [search, tokens]);

  return (
    <section>
      <div className="relative mb-6 max-w-xl">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lf-text-faint" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search tokens, tickers, characters or mint addresses"
          aria-label="Search tokens"
          className="w-full rounded-xl border border-lf-glass-border bg-lf-charcoal/70 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-lf-purple-light"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-16 text-sm text-lf-text-dim"><LoaderCircle className="animate-spin" size={18} /> Loading public tokens…</div>
      ) : error ? (
        <GlassCard hover={false} className="py-12 text-center">
          <p className="font-semibold">Tokens couldn’t be loaded</p>
          <p className="mt-2 text-sm text-lf-text-dim">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Try again</button>
        </GlassCard>
      ) : visibleTokens.length === 0 ? (
        <GlassCard hover={false} className="relative overflow-hidden py-10 text-center sm:py-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.16),transparent_62%)]"
          />
          <div className="relative mx-auto max-w-4xl px-2">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-lf-purple-light/30 bg-lf-purple/10">
              <Coins size={30} className="text-lf-purple-light" />
            </div>

            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-lf-cyan">
              LoreForge token ecosystem
            </p>

            <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
              {tokens.length ? "No matching tokens" : "Your token story starts here"}
            </h2>

            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-lf-text-dim">
              {tokens.length
                ? "Try another token name, ticker, character or mint address."
                : "Tokens appear here when they are associated with a LoreForge character and that character is made public. You can prepare your character before you launch anything."}
            </p>

            {!tokens.length ? (
              <>
                <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
                  <div className="rounded-xl border border-lf-glass-border bg-lf-charcoal/60 p-4">
                    <span className="grid size-8 place-items-center rounded-lg bg-lf-purple/15 text-sm font-bold text-lf-purple-light">01</span>
                    <h3 className="mt-3 text-sm font-semibold">Create your character</h3>
                    <p className="mt-1 text-xs leading-5 text-lf-text-dim">
                      Build the character, artwork and story behind your project.
                    </p>
                  </div>

                  <div className="rounded-xl border border-lf-glass-border bg-lf-charcoal/60 p-4">
                    <span className="grid size-8 place-items-center rounded-lg bg-lf-purple/15 text-sm font-bold text-lf-purple-light">02</span>
                    <h3 className="mt-3 text-sm font-semibold">Associate a token</h3>
                    <p className="mt-1 text-xs leading-5 text-lf-text-dim">
                      Open your character and add an existing Solana mint in its token panel.
                    </p>
                  </div>

                  <div className="rounded-xl border border-lf-glass-border bg-lf-charcoal/60 p-4">
                    <span className="grid size-8 place-items-center rounded-lg bg-lf-purple/15 text-sm font-bold text-lf-purple-light">03</span>
                    <h3 className="mt-3 text-sm font-semibold">Publish your character</h3>
                    <p className="mt-1 text-xs leading-5 text-lf-text-dim">
                      Make the character public so its associated token can appear in this directory.
                    </p>
                  </div>
                </div>

                <div className="mt-7 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/create"
                    className="inline-flex items-center gap-2 rounded-xl bg-lf-purple px-5 py-3 text-sm font-semibold transition hover:bg-lf-violet"
                  >
                    <Sparkles size={16} />
                    Create a character
                  </Link>

                  <Link
                    href="/characters"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold transition hover:border-lf-purple-light/50 hover:bg-white/5"
                  >
                    <UserRound size={16} />
                    My characters
                  </Link>
                </div>

                <p className="mx-auto mt-5 max-w-xl text-xs leading-5 text-lf-text-faint">
                  No token launch is required to create your character. Only associate a mint for a token that exists, and remember that verifying a mint does not establish ownership of the token project.
                </p>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-5 rounded-lg border border-white/15 px-4 py-2 text-sm transition hover:bg-white/5"
              >
                Clear search
              </button>
            )}
          </div>
        </GlassCard>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visibleTokens.map((token) => (
            <Link key={token.mintAddress} href={`/tokens/${encodeURIComponent(token.mintAddress)}`} className="group block min-w-0">
              <GlassCard className="h-full overflow-hidden transition group-hover:border-lf-purple-light/50">
                <div className="relative mb-4 aspect-[16/9] overflow-hidden rounded-lg border border-white/10 bg-black/30">
                  {token.character.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={token.character.coverUrl} alt={token.character.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                  ) : <div className="grid h-full place-items-center"><Coins size={32} className="text-lf-text-faint" /></div>}
                  <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/65 px-2.5 py-1 text-[11px] text-lf-text-dim">Solana</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-lg font-bold group-hover:text-lf-purple-light">{token.tokenName || token.character.name}</h2>
                    <p className="mt-1 text-sm text-lf-cyan">{token.tokenTicker ? `$${token.tokenTicker.replace(/^\$/, "")}` : "Token ticker not provided"}</p>
                  </div>
                  <ArrowUpRight size={18} className="shrink-0 text-lf-text-faint transition group-hover:text-lf-cyan" />
                </div>
                <p className="mt-3 text-sm text-lf-text-dim">Character: {token.character.name}</p>
                {token.character.lore.catchphrase && <p className="mt-2 line-clamp-2 text-sm italic text-lf-text-faint">“{token.character.lore.catchphrase}”</p>}
                <div className="mt-4 border-t border-white/10 pt-3 text-xs text-lf-text-faint">{shortAddress(token.mintAddress)} · by {token.character.creatorDisplayName}</div>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
