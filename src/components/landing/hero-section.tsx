import Link from "next/link";
import { ArrowUpRight, Palette, Rocket, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="font-display text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
          <span className="lf-gradient-text">Your imagination.</span>
          <br />
          <span className="lf-gradient-text">Your characters.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-balance text-base text-lf-text-dim sm:text-lg">
          Create original AI characters, build their stories and memecoin
          brands, and explore external token launch platforms.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/create">
            <Button variant="primary">Create character</Button>
          </Link>

          <Link href="/explore">
            <Button variant="secondary">Explore characters</Button>
          </Link>
        </div>
      </div>

      <div className="mx-auto mt-16 grid max-w-5xl gap-5 sm:grid-cols-3">
        <Link
          href="/create"
          className="lf-glass lf-glass-hover group rounded-2xl p-6 transition-colors"
        >
          <Sparkles size={25} className="text-lf-cyan" />

          <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-lf-text-faint">
            Step 01
          </p>

          <h2 className="mt-2 font-display text-lg font-bold">
            Create your character
          </h2>

          <p className="mt-2 text-sm leading-6 text-lf-text-dim">
            Turn your ideas and reference images into original characters with
            their own identity.
          </p>

          <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-lf-cyan">
            Start creating
            <ArrowUpRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </span>
        </Link>

        <Link
          href="/launch-kit"
          className="lf-glass lf-glass-hover group rounded-2xl p-6 transition-colors"
        >
          <Palette size={25} className="text-lf-cyan" />

          <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-lf-text-faint">
            Step 02
          </p>

          <h2 className="mt-2 font-display text-lg font-bold">
            Build your project
          </h2>

          <p className="mt-2 text-sm leading-6 text-lf-text-dim">
            Prepare your memecoin concept, project story, branding and community
            materials.
          </p>

          <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-lf-cyan">
            Open Launch Kit
            <ArrowUpRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </span>
        </Link>

        <Link
          href="/launchpads"
          className="lf-glass lf-glass-hover group rounded-2xl p-6 transition-colors"
        >
          <Rocket size={25} className="text-lf-cyan" />

          <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-lf-text-faint">
            Step 03
          </p>

          <h2 className="mt-2 font-display text-lg font-bold">
            Explore launchpads
          </h2>

          <p className="mt-2 text-sm leading-6 text-lf-text-dim">
            Compare listed external launch options and review their requirements
            before proceeding.
          </p>

          <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-lf-cyan">
            View launchpads
            <ArrowUpRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </span>
        </Link>
      </div>
    </section>
  );
}
