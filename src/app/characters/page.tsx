import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getServerUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getMyCharacters } from "@/lib/characters-data";
import { CharacterCard } from "@/components/characters/character-card";
import { SetupNotice } from "@/components/ui/setup-notice";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "My Characters — LoreForge AI" };

export default async function MyCharactersPage() {
  if (!isSupabaseConfigured()) {
    return <div className="mx-auto max-w-2xl px-4 py-16"><SetupNotice what="Your collection" /></div>;
  }
  const { supabase, user } = await getServerUser();
  if (!supabase || !user) redirect("/login?next=/characters");

  const characters = await getMyCharacters(supabase, user.id);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">My Characters</h1>
          <p className="mt-2 text-sm text-lf-text-dim">
            {characters.length === 0
              ? "Your saved characters live here. They're private until you choose to publish them."
              : `${characters.length} saved · private until you publish them to Explore`}
          </p>
        </div>
        <Link href="/create"><Button variant="primary"><Plus size={16} /> New character</Button></Link>
      </div>

      {characters.length === 0 ? (
        <GlassCard hover={false} className="py-14 text-center">
          <p className="font-display text-lg font-bold">Nothing here yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-lf-text-dim">
            Generate a character in the studio and press &ldquo;Save to collection&rdquo;.
          </p>
          <Link href="/create" className="mt-6 inline-block"><Button variant="primary">Open the studio</Button></Link>
        </GlassCard>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {characters.map((c) => <CharacterCard key={c.id} character={c} />)}
        </div>
      )}
    </div>
  );
}
