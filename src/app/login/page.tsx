import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { GlassCard } from "@/components/ui/glass-card";
import { getServerUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeNextPath } from "@/lib/safe-redirect";
import { SetupNotice } from "@/components/ui/setup-notice";

export const metadata: Metadata = { title: "Sign in — LoreForge AI" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <SetupNotice what="Accounts" />
      </div>
    );
  }

  const { user } = await getServerUser();
  if (user) redirect(next);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-2xl font-bold">Welcome to LoreForge</h1>
      <p className="mt-2 text-sm text-lf-text-dim">
        Sign in to save characters, build a collection, and publish to Explore. No crypto wallet needed.
      </p>
      <GlassCard hover={false} className="mt-6">
        <LoginForm next={next} initialError={sp.error} />
      </GlassCard>
    </div>
  );
}
