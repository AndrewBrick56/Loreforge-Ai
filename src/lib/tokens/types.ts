/** Shared browser-safe DTO types for LoreForge token pages and server routes. */
export interface TokenMarketData {
  chainId: "solana";
  pairAddress: string;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  priceChange24hPct: number | null;
  buys24h: number | null;
  sells24h: number | null;
  dexId: string;
  pairUrl: string;
  chartEmbedUrl: string;
  baseSymbol: string;
  fetchedAt: string;
}

export interface PublicTokenCharacter {
  id: string;
  name: string;
  style: string;
  createdAt: string;
  coverUrl: string | null;
  creatorUsername: string;
  creatorDisplayName: string;
  lore: {
    title: string | null;
    catchphrase: string | null;
    personality: string | null;
    originStory: string | null;
  };
}

export interface PublicTokenDTO {
  mintAddress: string;
  tokenName: string | null;
  tokenTicker: string | null;
  launchpadId: "pump-fun" | "raydium-launchlab" | null;
  verifiedOnChain: boolean;
  decimals: number | null;
  associatedAt: string;
  updatedAt: string;
  character: PublicTokenCharacter;
  market?: TokenMarketData | null;
}
