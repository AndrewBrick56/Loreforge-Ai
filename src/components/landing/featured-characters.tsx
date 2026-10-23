import Link from "next/link";

import { getServerUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getExplore } from "@/lib/characters-data";
import { PublicCharacterCard } from "@/components/explore/public-character-card";
import { GlassCard } from "@/components/ui/glass-card";

export async function FeaturedCharactersSection() {
  let characters: any[] = [];

  if (isSupabaseConfigured()) {
    const { supabase } = await getServerUser();

    characters = await getExplore(supabase ?? (await createClient()), {
      sort: "trending",
      style: null,
      q: "",
      limit: 4,
    });
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold sm:text-3xl">
            Trending characters
          </h2>
          <p className="mt-2 text-sm text-lf-text-dim">
            Original characters published by the LoreForge community.
          </p>
        </div>

        <Link
          href="/explore"
          className="text-sm text-lf-purple-light hover:underline"
        >
          Explore all
        </Link>
      </div>

      {characters.length > 0 ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {characters.map((character) => (
            <PublicCharacterCard key={character.id} character={character} />
          ))}
        </div>
      ) : (
        <GlassCard hover={false} className="mt-8 px-6 py-12 text-center">
          <h3 className="font-display text-xl font-bold">
            Be among the first creators
          </h3>

          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-lf-text-dim">
            Your original characters can appear here when you save them and
            publish them to Explore. Every featured character comes from the
            community, not a demo list.
          </p>

          <Link
            href="/create"
            className="mt-6 inline-flex rounded-xl bg-lf-purple px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-85"
          >
            Create a character
          </Link>
        </GlassCard>
      )}
    </section>
  );
}
