"use client";

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { resolveSolanaEndpoint } from "@/lib/solana/network";

// Wallet connection is optional in LoreForge — this provider only makes
// wallet-adapter's context available. Nothing here requires a wallet.
// Wallet-specific adapter classes are intentionally NOT imported here;
// wallet-adapter-react-ui's WalletModalProvider auto-detects installed
// wallets that implement the Wallet Standard (Phantom, Solflare, Backpack,
// etc.) without us needing to hard-code adapter instances or extra deps.
export function AppProviders({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => resolveSolanaEndpoint(), []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
