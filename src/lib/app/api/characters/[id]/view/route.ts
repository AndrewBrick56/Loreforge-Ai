import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { UUID_RE, getServerUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/server";
import { getClientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Record a view of a PUBLIC character.
 *
 * Honest limits: one view per visitor per character per UTC day (enforced by
 * a unique constraint), the owner's own visits never count, and anonymous
 * visitors are identified by a salted hash of IP + user-agent (raw IPs are
 * never stored). A determined person rotating IPs could still inflate a
 * count; this stops casual refresh-spamming, not a botnet.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured() || !hasServiceRole()) return NextResponse.json({ counted: false });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ counted: false });

  const admin = createAdminClient();
  const { data: ch } = await admin.from("characters").select("id, owner_id, is_public").eq("id", id).maybeSingle();
  if (!ch || !ch.is_public) return NextResponse.json({ counted: false });

  const { user } = await getServerUser().catch(() => ({ user: null }));
  if (user && user.id === ch.owner_id) return NextResponse.json({ counted: false });

  const salt = process.env.GENERATION_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "lf";
  const viewerKey = user
    ? `u:${user.id}`
    : "a:" +
      createHash("sha256")
        .update(`${getClientKey(req)}|${req.headers.get("user-agent") ?? ""}|${salt}`)
        .digest("hex")
        .slice(0, 32);

  const { error } = await admin
    .from("views")
    .upsert({ character_id: id, viewer_key: viewerKey }, { onConflict: "character_id,viewer_key,view_date", ignoreDuplicates: true });
  if (error) console.error("[LoreForge] view insert failed:", error.message);

  return NextResponse.json({ counted: !error });
}
