import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getExplore, parseSort, parseStyle } from "@/lib/characters-data";
import { ExploreFilters } from "@/components/explore/explore-filters";
import { PublicCharacterCard } from "@/components/explore/public-character-card";
import { SetupNotice } from "@/components/ui/setup-notice";
import { GlassCard } from "@/components/ui/glass-card";
import type { ProfileRow } from "@/types/db";

export const metadata: Metadata = { title: "Creator — LoreForge AI" };

export default async function CreatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ sort?: string; style?: string }>;
}) {
  const { username } = await params;
  if (!/^[a-z0-9_]{3,24}$/.test(username)) notFound();
  if (!isSupabaseConfigured()) {
    return <div className="mx-auto max-w-2xl px-4 py-16"><SetupNotice what="Creator pages" /></div>;
  }

  const { supabase } = await getServerUser();
  if (!supabase) notFound();
  const { data } = await supabase.from("profiles").select("id, username, display_name").eq("username", username).maybeSingle();
  if (!data) notFound();
  const profile = data as ProfileRow;

  const sp = await searchParams;
  const sort = parseSort(sp.sort);
  const style = parseStyle(sp.style);
  const characters = await getExplore(supabase, { sort, style, q: "", creator: profile.username });

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{profile.display_name}</h1>
        <p className="mt-1 text-sm text-lf-text-faint">@{profile.username}</p>
      </div>

      <ExploreFilters sort={sort} style={style ?? ""} q="" showSearch={false} />

      <div className="mt-8">
        {characters.length === 0 ? (
          <GlassCard hover={false} className="py-12 text-center">
            <p className="text-sm text-lf-text-dim">
              {style ? "No public characters in that style." : `${profile.display_name} hasn't published any characters yet.`}
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
