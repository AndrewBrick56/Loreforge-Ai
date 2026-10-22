"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useCallback } from "react";
import { Wallet } from "lucide-react";

function shortenAddress(address: string, chars = 4) {
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function ConnectWalletButton() {
  const { publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  const handleClick = useCallback(() => {
    if (publicKey) {
      disconnect();
    } else {
      setVisible(true);
    }
  }, [publicKey, disconnect, setVisible]);

  return (
    <button
      onClick={handleClick}
      className="lf-btn-primary flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white cursor-pointer"
    >
      <Wallet size={16} />
      {connecting
        ? "Connecting…"
        : publicKey
          ? shortenAddress(publicKey.toBase58())
          : "Connect Wallet"}
    </button>
  );
}
