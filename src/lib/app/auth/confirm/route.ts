import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeNextPath } from "@/lib/safe-redirect";

/**
 * Confirms sign-up email tokens without relying on the browser that initiated sign-up.
 * After verification, clears the temporary session so the user can sign in deliberately.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeNextPath(url.searchParams.get("next"));

  if (!isSupabaseConfigured() || !tokenHash || (type !== "email" && type !== "signup")) {
    return NextResponse.redirect(new URL("/login?error=callback", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error) {
    return NextResponse.redirect(new URL("/login?error=callback", url.origin));
  }

  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    console.error("[LoreForge] Confirmation succeeded but temporary session could not be cleared.", signOutError.message);
    // If a session could not be cleared, continue to the destination rather than looping through /login.
    return NextResponse.redirect(new URL(next, url.origin));
  }

  const loginUrl = new URL("/login", url.origin);
  loginUrl.searchParams.set("confirmed", "1");
  loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}