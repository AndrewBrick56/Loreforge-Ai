import Link from "next/link";

import { getServerUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getExplore, type ExploreCardDTO } from "@/lib/characters-data";
import { PublicCharacterCard } from "@/components/explore/public-character-card";

export async function FeaturedCharactersSection() {
  let characters: ExploreCardDTO[] = [];

  if (isSupabaseConfigured()) {
    try {
      const { supabase } = await getServerUser();
      const client = supabase ?? (await createClient());

      characters = await getExplore(client, {
        sort: "trending",
        style: null,
        q: "",
        limit: 4,
      });
    } catch (error) {
      console.error(
        "[LoreForge] Homepage featured characters failed to load:",
        error,
      );
    }
  }

  return (
    <section
      aria-labelledby="featured-characters-heading"
      className="mx-auto max-w-7xl px-4 py-20 sm:px-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lf-cyan">
            LoreForge community
          </p>

          <h2
            id="featured-characters-heading"
            className="mt-2 font-display text-2xl font-bold sm:text-3xl"
          >
            Trending characters
          </h2>

          <p className="mt-2 text-sm text-lf-text-dim">
            Discover original characters published by their creators.
          </p>
        </div>

        <Link
          href="/explore"
          className="text-sm text-lf-purple-light hover:underline"
        >
          Explore all →
        </Link>
      </div>

      {characters.length > 0 ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {characters.map((character) => (
            <PublicCharacterCard key={character.id} character={character} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
          <h3 className="font-display text-xl font-bold">
            Your next favorite character starts here
          </h3>

          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-lf-text-dim">
            Characters appear here after their creators save them and publish
            them to Explore. Create your own character or browse the community
            to get started.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/create"
              className="rounded-xl bg-lf-purple px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              Create a character
            </Link>

            <Link
              href="/explore"
              className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/5"
            >
              Browse Explore
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
