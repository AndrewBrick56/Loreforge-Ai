import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CharacterArtPlaceholder } from "@/components/ui/character-art-placeholder";

const EXAMPLES = [
  {
    seed: "billionaire-pigeon",
    palette: "purple" as const,
    emoji: "🐦",
    name: "Reginald Featherstone III",
    blurb: "An arrogant pigeon CEO who believes he owns the internet.",
  },
  {
    seed: "cyberpunk-cat",
    palette: "cyan" as const,
    emoji: "🐱",
    name: "Nyx-9",
    blurb: "A neon-drenched street cat running black-market data.",
  },
  {
    seed: "futuristic-dog",
    palette: "pink" as const,
    emoji: "🐕",
    name: "Titan Ray",
    blurb: "A chrome-plated good boy from the year 3081.",
  },
];

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
          Transform ordinary photos into extraordinary AI characters. Create,
          customize and unleash your imagination.
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

      <div className="mt-16 grid gap-5 sm:mt-20 sm:grid-cols-3">
        {EXAMPLES.map((ex, i) => (
          <div
            key={ex.seed}
            className="lf-glass lf-glass-hover overflow-hidden p-3"
            style={{ transform: i === 1 ? "translateY(-12px)" : undefined }}
          >
            <CharacterArtPlaceholder seed={ex.seed} palette={ex.palette} emoji={ex.emoji} />
            <div className="px-1 pb-1 pt-3">
              <p className="font-display text-sm font-bold">{ex.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-lf-text-dim">{ex.blurb}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
