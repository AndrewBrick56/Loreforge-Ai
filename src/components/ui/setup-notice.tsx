import { GlassCard } from "./glass-card";

/** Shown instead of a broken page when Supabase environment variables are missing. */
export function SetupNotice({ what }: { what: string }) {
  return (
    <GlassCard hover={false} className="space-y-2 border-lf-cyan/30">
      <p className="font-display text-base font-bold">{what} aren&apos;t set up yet</p>
      <p className="text-sm text-lf-text-dim">
        This feature needs a Supabase project. Add <code className="text-lf-cyan">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
        <code className="text-lf-cyan">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and{" "}
        <code className="text-lf-cyan">SUPABASE_SERVICE_ROLE_KEY</code> to <code>.env.local</code>, run{" "}
        <code>supabase/schema.sql</code> in the Supabase SQL editor, then restart the dev server. The README has the full steps.
      </p>
    </GlassCard>
  );
}
