import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Next.js 16 renamed `middleware` to `proxy`.
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next();
  try {
    return await updateSession(request);
  } catch (err) {
    // Session-refresh outages should not crash every page. Protected API routes
    // still perform their own authentication and authorization checks.
    console.error("[LoreForge] proxy session refresh failed:", err);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
