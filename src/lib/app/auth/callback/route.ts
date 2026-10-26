import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeNextPath } from "@/lib/safe-redirect";

/** Landing point for confirmation emails and magic links: swaps the one-time code for a session cookie. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const flow = searchParams.get("flow");

  if (code && isSupabaseConfigured()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (flow === "signup") {
        // Email verification is complete; clear the temporary session so the user can sign in normally.
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          console.error("[LoreForge] Confirmation succeeded but temporary session could not be cleared.", signOutError.message);
          return NextResponse.redirect(`${origin}${next}`);
        }
        const loginUrl = new URL("/login", origin);
        loginUrl.searchParams.set("confirmed", "1");
        loginUrl.searchParams.set("next", next);
        return NextResponse.redirect(loginUrl);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=callback`);
}
