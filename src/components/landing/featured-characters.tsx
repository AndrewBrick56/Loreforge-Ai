import { CharacterArtPlaceholder } from "@/components/ui/character-art-placeholder";

const FEATURED = [
  { seed: "moon-samurai", palette: "cyan" as const, emoji: "🌕", name: "Moon Samurai", creator: "@kaida", style: "Anime" },
  { seed: "clockwork-fox", palette: "amber" as const, emoji: "🦊", name: "Clockwork Fox", creator: "@finn.codes", style: "Fantasy" },
  { seed: "disco-hamster", palette: "pink" as const, emoji: "🐹", name: "DJ Sunflower", creator: "@marta", style: "Internet Meme" },
  { seed: "void-crow", palette: "purple" as const, emoji: "🐦‍⬛", name: "Void Crow", creator: "@ren", style: "Comic Book" },
];

export function FeaturedCharactersSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">Featured characters</h2>
        <a href="/explore" className="text-sm text-lf-purple-light hover:underline">
          See all
        </a>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURED.map((c) => (
          <div key={c.seed} className="lf-glass lf-glass-hover overflow-hidden p-3">
            <CharacterArtPlaceholder seed={c.seed} palette={c.palette} emoji={c.emoji} />
            <div className="px-1 pb-1 pt-3">
              <p className="font-display text-sm font-bold">{c.name}</p>
              <div className="mt-1 flex items-center justify-between text-xs text-lf-text-dim">
                <span>{c.creator}</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5">{c.style}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
