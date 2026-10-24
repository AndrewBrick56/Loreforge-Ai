"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { CheckCircle2, Copy, ExternalLink, LoaderCircle, ShieldCheck, Unlink, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type LinkedWallet = {
  walletAddress: string | null;
  walletVerifiedAt: string | null;
};

function shortenAddress(address: string, chars = 4) {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function ConnectWalletButton() {
  const { publicKey, disconnect, connecting, signMessage } = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const [linkedWallet, setLinkedWallet] = useState<LinkedWallet | null>(null);
  const [busy, setBusy] = useState<"verify" | "unlink" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const address = publicKey?.toBase58() ?? null;
  const walletIsLinked = Boolean(address && linkedWallet?.walletAddress === address && linkedWallet.walletVerifiedAt);

  useEffect(() => {
    if (!address) return;

    const controller = new AbortController();
    void fetch("/api/wallet/link", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as LinkedWallet;
      })
      .then((result) => {
        if (!controller.signal.aborted && result) setLinkedWallet(result);
      })
      .catch(() => {
        // Wallet connection remains usable even if the signed-in account link can't be loaded.
      });

    return () => controller.abort();
  }, [address]);

  const handleButtonClick = useCallback(() => {
    if (!publicKey) {
      setVisible(true);
      return;
    }

    const nextOpen = !open;
    setOpen(nextOpen);
    setNotice(null);
    setError(null);

    // Refresh persisted link status whenever this panel opens.
    // This prevents duplicate desktop/mobile button instances from
    // showing a stale wallet association after unlinking.
    if (nextOpen) {
      void fetch("/api/wallet/link", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(
              await responseError(response, "Couldn't refresh wallet link status.")
            );
          }
          return (await response.json()) as LinkedWallet;
        })
        .then((result) => {
          setLinkedWallet({
            walletAddress: result.walletAddress ?? null,
            walletVerifiedAt: result.walletVerifiedAt ?? null,
          });
        })
        .catch((caught) => {
          setError(
            caught instanceof Error
              ? caught.message
              : "Couldn't refresh wallet link status."
          );
        });
    }
  }, [publicKey, setVisible, open]);

  const handleCopy = useCallback(async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setNotice("Wallet address copied.");
      setError(null);
    } catch {
      setError("Couldn't copy automatically. You can select the address above and copy it.");
    }
  }, [address]);

  const handleVerifyAndLink = useCallback(async () => {
    if (!address || !publicKey) {
      setError("Connect a wallet first.");
      return;
    }
    if (!signMessage) {
      setError("This wallet doesn't support message signing. Try a wallet that supports signMessage.");
      return;
    }

    setBusy("verify");
    setError(null);
    setNotice(null);
    try {
      const challengeResponse = await fetch("/api/wallet/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      if (!challengeResponse.ok) {
        throw new Error(await responseError(challengeResponse, "Couldn't start wallet verification."));
      }
      const challenge = (await challengeResponse.json()) as { nonce: string; message: string };

      // This asks the wallet to sign a readable off-chain message, not a transaction.
      const signature = await signMessage(new TextEncoder().encode(challenge.message));

      const verifyResponse = await fetch("/api/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce: challenge.nonce,
          walletAddress: address,
          signatureBase64: bytesToBase64(signature),
        }),
      });
      if (!verifyResponse.ok) {
        throw new Error(await responseError(verifyResponse, "Wallet verification failed."));
      }

      const result = (await verifyResponse.json()) as { walletAddress: string; walletVerifiedAt: string };
      setLinkedWallet({ walletAddress: result.walletAddress, walletVerifiedAt: result.walletVerifiedAt });
      setNotice("Wallet verified and linked to your LoreForge account.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wallet verification failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }, [address, publicKey, signMessage]);

  const handleUnlink = useCallback(async () => {
    if (!window.confirm("Unlink this wallet from your LoreForge account? This won't disconnect it from your browser.")) return;

    setBusy("unlink");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/wallet/link", { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response, "Couldn't unlink the wallet."));
      setLinkedWallet({ walletAddress: null, walletVerifiedAt: null });
      setNotice("Wallet unlinked from your LoreForge account.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't unlink this wallet.");
    } finally {
      setBusy(null);
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    setError(null);
    setNotice(null);
    try {
      await disconnect();
      setOpen(false);
    } catch {
      setError("Couldn't disconnect this wallet. Please try again.");
    }
  }, [disconnect]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleButtonClick}
        aria-expanded={Boolean(publicKey && open)}
        aria-haspopup={publicKey ? "dialog" : "listbox"}
        className="lf-btn-primary flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white"
      >
        {connecting ? <LoaderCircle size={16} className="animate-spin" /> : <Wallet size={16} />}
        {connecting ? "Connecting..." : address ? shortenAddress(address) : "Connect Wallet"}
      </button>

      {publicKey && open && (
        <div role="dialog" aria-label="Connected Solana wallet" className="absolute right-0 top-full z-[70] mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#11101a] p-4 text-sm text-white shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Solana wallet</p>
              <p className="mt-1 text-xs text-white/60">Connected in this browser</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close wallet panel" className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white">
              <X size={16} />
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="break-all font-mono text-xs leading-5">{address}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleCopy} className="inline-flex items-center gap-1.5 text-xs text-white/75 hover:text-white">
                <Copy size={13} /> {copied ? "Copied" : "Copy address"}
              </button>
              <a href={`https://explorer.solana.com/address/${address}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-white/75 hover:text-white">
                Explorer <ExternalLink size={12} />
              </a>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 p-3">
            <div className="flex items-center gap-2">
              {walletIsLinked ? <CheckCircle2 size={17} className="text-emerald-400" /> : <ShieldCheck size={17} className="text-lf-cyan" />}
              <p className="font-medium">{walletIsLinked ? "Verified and linked" : "Wallet not verified for this account"}</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-white/60">
              {walletIsLinked
                ? "You've proved control of this wallet for your signed-in LoreForge account."
                : linkedWallet?.walletAddress
                  ? `A different wallet (${shortenAddress(linkedWallet.walletAddress)}) is linked. Verify this wallet to replace it.`
                  : "Sign a one-time message to link this wallet to your signed-in LoreForge account. No transaction or network fee is involved."}
            </p>
            {!walletIsLinked && (
              <button type="button" onClick={handleVerifyAndLink} disabled={busy !== null} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-lf-purple px-3 py-2.5 font-semibold transition hover:bg-lf-violet disabled:cursor-not-allowed disabled:opacity-50">
                {busy === "verify" ? <LoaderCircle size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                {busy === "verify" ? "Waiting for signature..." : "Verify & link wallet"}
              </button>
            )}
            {linkedWallet?.walletAddress && (
              <button type="button" onClick={handleUnlink} disabled={busy !== null} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/75 transition hover:bg-white/5 disabled:opacity-50">
                {busy === "unlink" ? <LoaderCircle size={14} className="animate-spin" /> : <Unlink size={14} />}
                Unlink wallet from account
              </button>
            )}
          </div>

          {notice && <p role="status" className="mt-3 text-xs text-emerald-300">{notice}</p>}
          {error && <p role="alert" className="mt-3 text-xs leading-5 text-rose-300">{error}</p>}

          <p className="mt-3 text-[11px] leading-4 text-white/45">
            Wallet linking proves control of the wallet address only. It doesn&apos;t prove ownership of a token, coin project, or character.
          </p>

          <button type="button" onClick={handleDisconnect} disabled={busy !== null} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/75 transition hover:bg-white/5 disabled:opacity-50">
            <Wallet size={14} /> Disconnect from this browser
          </button>
        </div>
      )}
    </div>
  );
}
