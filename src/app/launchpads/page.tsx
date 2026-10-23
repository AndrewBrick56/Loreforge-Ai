import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  ExternalLink,
  Network,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { getLaunchpads } from "@/lib/launchpads/registry";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

export const metadata: Metadata = {
  title: "Launchpads — LoreForge AI",
  description:
    "Explore third-party token launch platforms and prepare your character-driven memecoin project with LoreForge AI.",
};

export default function LaunchpadsPage() {
  const launchpads = getLaunchpads();

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lf-cyan">
          Creator tools · Web3
        </p>

        <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
          Launchpad directory
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-lf-text-dim sm:text-base">
          Discover external platforms where you can explore launching a
          character-driven token. Prepare your character and branding in
          LoreForge, then review the launch options available on each platform.
        </p>
      </header>

      <GlassCard hover={false} className="mb-8">
        <div className="flex items-start gap-3">
          <ShieldAlert size={22} className="mt-0.5 shrink-0 text-amber-300" />
          <div>
            <h2 className="font-semibold">Independent third-party platforms</h2>
            <p className="mt-2 text-sm leading-6 text-lf-text-dim">
              These platforms are listed for discovery. LoreForge does not
              operate them, and the listings below are not partnership claims.
              Clicking a launch link takes you to the external platform. Your
              project details and artwork are not automatically transferred from
              LoreForge.
            </p>
          </div>
        </div>
      </GlassCard>

      <section aria-labelledby="launchpad-list-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="launchpad-list-heading"
              className="font-display text-xl font-bold"
            >
              Available platforms
            </h2>
            <p className="mt-1 text-sm text-lf-text-dim">
              {launchpads.length} launch destinations listed
            </p>
          </div>

          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-lf-text-dim">
            <Network size={14} />
            Solana ecosystem
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {launchpads.map((launchpad) => {
            const partnershipLabel =
              launchpad.partnershipStatus === "partner"
                ? "LoreForge partner"
                : launchpad.partnershipStatus === "contacted"
                  ? "Partnership not confirmed"
                  : "Not a LoreForge partner";

            const partnershipClass =
              launchpad.partnershipStatus === "partner"
                ? "border-lf-cyan/30 bg-lf-cyan/10 text-lf-cyan"
                : "border-amber-300/20 bg-amber-300/10 text-amber-200";

            return (
              <GlassCard
                key={launchpad.id}
                hover={false}
                className="flex h-full flex-col p-5 sm:p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-lf-text-faint">
                      {launchpad.network} network
                    </p>

                    <h3 className="mt-2 font-display text-xl font-bold">
                      {launchpad.name}
                    </h3>
                  </div>

                  <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium uppercase">
                    External
                  </span>
                </div>

                <p className="mt-4 text-sm leading-6 text-lf-text-dim">
                  {launchpad.description}
                </p>

                <div className="mt-5">
                  <span
                    className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${partnershipClass}`}
                  >
                    {partnershipLabel}
                  </span>
                </div>

                <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold">Before you leave</p>

                  <ul className="mt-2 space-y-2 text-sm text-lf-text-dim">
                    <li>
                      Review the platform&apos;s current fees and requirements.
                    </li>
                    <li>Confirm your token name and ticker.</li>
                    <li>Review all transaction details before signing.</li>
                  </ul>
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
                  <a
                    href={launchpad.launchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-lf-cyan px-4 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-85"
                  >
                    Visit launch page
                    <ArrowUpRight size={16} />
                  </a>

                  <a
                    href={`/api/launchpads/${launchpad.id}/handoff`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-lf-text-dim transition-colors hover:bg-white/5 hover:text-white"
                  >
                    Official site
                    <ExternalLink size={14} />
                  </a>

                  <a
                    href={launchpad.documentationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-lf-text-faint underline underline-offset-4 hover:text-white"
                  >
                    Terms and guidance
                  </a>
                </div>

                <p className="mt-4 break-all text-xs text-lf-text-faint">
                  Registry ID: {launchpad.id}
                </p>
              </GlassCard>
            );
          })}
        </div>
      </section>

      <GlassCard hover={false} className="mt-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Sparkles size={22} className="mt-1 shrink-0 text-lf-cyan" />

            <div>
              <h2 className="font-display text-lg font-bold">
                Prepare your memecoin project first
              </h2>

              <p className="mt-1 max-w-xl text-sm leading-6 text-lf-text-dim">
                Build your character&apos;s story, project identity and launch
                materials before deciding where to launch.
              </p>
            </div>
          </div>

          <Link href="/launch-kit" className="shrink-0">
            <Button>
              Open Launch Kit
              <ArrowUpRight size={15} />
            </Button>
          </Link>
        </div>
      </GlassCard>

      <p className="mt-8 text-xs leading-5 text-lf-text-faint">
        Launchpad availability, requirements and fees can change. Listing a
        platform does not imply endorsement, partnership, token approval or
        guaranteed financial results. Referral tracking is not enabled until an
        applicable arrangement has been authorized.
      </p>
    </main>
  );
}
