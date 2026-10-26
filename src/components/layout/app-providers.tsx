"use client";

import { useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { useWrappedReownAdapter } from "@jup-ag/jup-mobile-adapter";
import { resolveSolanaEndpoint } from "@/lib/solana/network";

function SolanaWallets({ children }: { children: ReactNode }) {
  const { reownAdapter, jupiterAdapter } = useWrappedReownAdapter({
    appKitOptions: {
      metadata: {
        name: "LoreForge AI",
        description: "Create characters and explore Solana tokens.",
        url:
          typeof window !== "undefined"
            ? window.location.origin
            : "https://localhost",
        icons: [],
      },
      projectId: "482abaa276000deb7f6724e6d3e4d77e",
      features: {
        analytics: false,
        email: false,
      },
      enableWallets: false,
    },
  });

  const wallets = useMemo(
    () => [reownAdapter, jupiterAdapter],
    [reownAdapter, jupiterAdapter],
  );

  return (
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>{children}</WalletModalProvider>
    </WalletProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => resolveSolanaEndpoint(), []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWallets>{children}</SolanaWallets>
    </ConnectionProvider>
  );
}
