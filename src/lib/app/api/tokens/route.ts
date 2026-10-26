import { NextResponse } from "next/server";
import { getPublicTokenDirectory } from "@/lib/tokens/public-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 100;
  const tokens = await getPublicTokenDirectory(limit);

  return NextResponse.json(
    { tokens },
    { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" } },
  );
}
