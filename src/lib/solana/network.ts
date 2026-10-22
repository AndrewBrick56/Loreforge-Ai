import { clusterApiUrl } from "@solana/web3.js";

// Shared by browser wallet UI and server-side read-only mint verification.
// Keep the existing devnet default to avoid silently changing user networks.
const NETWORKS = ["mainnet-beta", "devnet", "testnet"] as const;
type Network = (typeof NETWORKS)[number];

export function resolveSolanaNetwork(): Network {
  const raw = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet").trim().replace(/^['\"]|['\"]$/g, "");
  return (NETWORKS as readonly string[]).includes(raw) ? (raw as Network) : "devnet";
}

export function resolveSolanaEndpoint(): string {
  const custom = (process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "").trim();
  if (/^https?:\/\/\S+$/.test(custom)) return custom;
  return clusterApiUrl(resolveSolanaNetwork());
}
