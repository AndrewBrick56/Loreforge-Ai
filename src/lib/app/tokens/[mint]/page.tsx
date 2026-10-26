import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { checkMintAddressFormat } from "@/lib/solana/mint";
import { TokenDetailView } from "@/components/tokens/token-detail-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Token Details — LoreForge AI",
  description: "Token information, chart and market activity for a LoreForge character token.",
};

export default async function TokenDetailPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  if (!checkMintAddressFormat(mint).ok) notFound();
  return <TokenDetailView mintAddress={mint} />;
}
