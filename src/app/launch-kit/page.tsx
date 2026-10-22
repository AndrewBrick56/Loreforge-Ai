import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getMyCharacters } from "@/lib/characters-data";
import { SetupNotice } from "@/components/ui/setup-notice";
import { LaunchKitBuilder } from "@/components/launch/launch-kit-builder";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Character Launch Kit — LoreForge AI",
  description:
    "Prepare a character-driven memecoin project with LoreForge.",
};

export default async function LaunchKitPage({
  searchParams,
}: {
  searchParams: Promise<{ character?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <SetupNotice what="The Character Launch Kit" />
      </div>
    );
  }

  const { supabase, user } = await getServerUser();

  if (!supabase || !user) {
    redirect("/login?next=/launch-kit");
  }

  const params = await searchParams;
  const characters = await getMyCharacters(supabase, user.id);

  return (
    <LaunchKitBuilder
      characters={characters}
      initialCharacterId={params.character}
    />
  );
}