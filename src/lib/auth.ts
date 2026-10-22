import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient, hasServiceRole } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** For pages / server components: returns nulls when logged out or Supabase isn't set up. */
export async function getServerUser(): Promise<{ supabase: SupabaseClient | null; user: User | null }> {
  if (!isSupabaseConfigured()) return { supabase: null, user: null };
  const supabase = await createClient();
  // getUser() re-validates the token with Supabase's auth server. Never trust
  // getSession() on the server: it only reads the cookie without verifying it.
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

type Authed = { supabase: SupabaseClient; user: User };

/** For API routes: either an authenticated context, or a ready-to-return error response. */
export async function requireUser(opts?: { needsServiceRole?: boolean }): Promise<Authed | NextResponse> {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Accounts aren't configured on this server yet (Supabase keys missing).", code: "SUPABASE_NOT_CONFIGURED" },
      { status: 503 }
    );
  }
  if (opts?.needsServiceRole && !hasServiceRole()) {
    return NextResponse.json(
      { error: "Storage isn't configured on this server yet (SUPABASE_SERVICE_ROLE_KEY missing).", code: "STORAGE_NOT_CONFIGURED" },
      { status: 503 }
    );
  }
  const { supabase, user } = await getServerUser();
  if (!supabase || !user) {
    return NextResponse.json({ error: "Please sign in first.", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  return { supabase, user };
}

export function isErrorResponse(v: Authed | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
