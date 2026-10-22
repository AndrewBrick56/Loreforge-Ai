import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ProfileForm } from "@/components/auth/profile-form";
import { SetupNotice } from "@/components/ui/setup-notice";
import { GlassCard } from "@/components/ui/glass-card";
import type { ProfileRow } from "@/types/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Profile settings — LoreForge AI" };

export default async function AccountPage() {
  if (!isSupabaseConfigured()) {
    return <div className="mx-auto max-w-md px-4 py-16"><SetupNotice what="Accounts" /></div>;
  }
  const { supabase, user } = await getServerUser();
  if (!supabase || !user) redirect("/login?next=/account");

  const { data } = await supabase.from("profiles").select("id, username, display_name").eq("id", user.id).maybeSingle();
  const profile = data as ProfileRow | null;

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-display text-2xl font-bold">Profile settings</h1>
      <p className="mt-2 text-sm text-lf-text-dim">Signed in as {user.email}. Your email is never shown publicly.</p>
      <GlassCard hover={false} className="mt-6">
        {profile ? (
          <ProfileForm initialUsername={profile.username} initialDisplayName={profile.display_name} />
        ) : (
          <p className="text-sm text-red-300">Your profile row is missing. Did you run supabase/schema.sql before signing up?</p>
        )}
      </GlassCard>
    </div>
  );
}
