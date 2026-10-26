import type { Metadata } from "next";
import { getServerUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getExplore, parseSort, parseStyle } from "@/lib/characters-data";
import { ExploreFilters } from "@/components/explore/explore-filters";
import { PublicCharacterCard } from "@/components/explore/public-character-card";
import { SetupNotice } from "@/components/ui/setup-notice";
import { GlassCard } from "@/components/ui/glass-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Explore — LoreForge AI" };

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; style?: string; q?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return <div className="mx-auto max-w-2xl px-4 py-16"><SetupNotice what="Explore" /></div>;
  }

  const sp = await searchParams;
  const sort = parseSort(sp.sort);
  const style = parseStyle(sp.style);
  const q = (sp.q ?? "").slice(0, 60);

  // Works for signed-out visitors too: RLS only ever returns characters their owners published.
  const { supabase } = await getServerUser();
  const characters = await getExplore(supabase ?? (await createClient()), { sort, style, q });
  const filtered = Boolean(style || q.trim());

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Explore</h1>
        <p className="mt-2 max-w-xl text-sm text-lf-text-dim">
          Characters their creators chose to publish. Likes and view counts are real and come straight from the database.
        </p>
      </div>

      <ExploreFilters sort={sort} style={style ?? ""} q={q} />

      <div className="mt-8">
        {characters.length === 0 ? (
          <GlassCard hover={false} className="py-14 text-center">
            <p className="font-display text-lg font-bold">
              {filtered ? "No characters match those filters" : "No public characters yet"}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-lf-text-dim">
              {filtered
                ? "Try a different style or search term."
                : "Be the first: create a character, save it, then choose “Publish to Explore”."}
            </p>
          </GlassCard>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {characters.map((c) => <PublicCharacterCard key={c.id} character={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}
