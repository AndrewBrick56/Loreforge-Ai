import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Sparkles } from "lucide-react";
import { TokenDirectory } from "@/components/tokens/token-directory";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Token Directory — LoreForge AI",
  description: "Discover Solana tokens associated with LoreForge characters and stories.",
};

export default function TokensPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-lf-cyan"><Sparkles size={14} /> LoreForge ecosystem</p>
          <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Token directory</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-lf-text-dim">Explore tokens associated with published characters, read their lore, view market data and open their external trading market.</p>
        </div>
        <Link href="/characters" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm hover:border-lf-purple-light/50 hover:bg-white/5"><Coins size={16} /> My characters</Link>
      </div>
      <TokenDirectory />
      <p className="mt-8 text-xs leading-relaxed text-lf-text-faint">LoreForge displays creator-provided token associations and third-party market data. A valid mint does not establish project ownership, legitimacy, liquidity or investment value.</p>
    </main>
  );
}
