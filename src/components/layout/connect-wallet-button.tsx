"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { CheckCircle2, Coins, Copy, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, Unlink, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type LinkedWallet = {
  walletAddress: string | null;
  walletVerifiedAt: string | null;
};

type WalletHolding = {
  mint: string;
  rawAmount: string;
  decimals: number;
};

type ParsedTokenAccount = {
  account: {
    data: {
      parsed?: {
        info?: {
          mint?: unknown;
          tokenAmount?: {
            amount?: unknown;
            decimals?: unknown;
          };
        };
      };
    };
  };
};

const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

function addIntegerStrings(left: string, right: string): string {
  let i = left.length - 1;
  let j = right.length - 1;
  let carry = 0;
  let output = "";

  while (i >= 0 || j >= 0 || carry > 0) {
    const a = i >= 0 ? left.charCodeAt(i) - 48 : 0;
    const b = j >= 0 ? right.charCodeAt(j) - 48 : 0;
    const sum = a + b + carry;
    output = String(sum % 10) + output;
    carry = Math.floor(sum / 10);
    i--;
    j--;
  }

  return output.replace(/^0+(?=\d)/, "") || "0";
}

function formatWalletTokenAmount(rawAmount: string, decimals: number): string {
  const digits = rawAmount.replace(/\D/g, "") || "0";
  const safeDecimals = Math.max(0, Math.min(255, Math.trunc(decimals)));
  if (safeDecimals === 0) return digits;

  const padded = digits.padStart(safeDecimals + 1, "0");
  const whole = padded.slice(0, -safeDecimals).replace(/^0+(?=\d)/, "") || "0";
  const fractional = padded.slice(-safeDecimals).replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole;
}

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
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const [linkedWallet, setLinkedWallet] = useState<LinkedWallet | null>(null);
  const [busy, setBusy] = useState<"verify" | "unlink" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [walletSolLamports, setWalletSolLamports] = useState<number | null>(null);
  const [walletHoldings, setWalletHoldings] = useState<WalletHolding[]>([]);
  const [walletAssetsOwnerAddress, setWalletAssetsOwnerAddress] = useState<string | null>(null);
  const [walletAssetsUpdatedAt, setWalletAssetsUpdatedAt] = useState<string | null>(null);
  const [walletAssetsLoading, setWalletAssetsLoading] = useState(false);
  const [walletAssetsError, setWalletAssetsError] = useState<string | null>(null);

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

  const handleRefreshWalletAssets = useCallback(async () => {
    if (!publicKey || !address) {
      setWalletAssetsError("Connect a wallet first.");
      return;
    }

    setWalletAssetsLoading(true);
    setWalletAssetsError(null);

    try {
      const [balanceResult, standardTokensResult, token2022Result] = await Promise.allSettled([
        connection.getBalance(publicKey, "confirmed"),
        connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: SPL_TOKEN_PROGRAM_ID },
          "confirmed",
        ),
        connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: TOKEN_2022_PROGRAM_ID },
          "confirmed",
        ),
      ]);

      if (balanceResult.status !== "fulfilled") {
        throw new Error("The Solana RPC could not load the SOL balance. Please refresh and try again.");
      }

      const holdingsByMint = new Map<string, WalletHolding>();
      let tokenProgramQueryIncomplete = false;

      for (const result of [standardTokensResult, token2022Result]) {
        if (result.status !== "fulfilled") {
          tokenProgramQueryIncomplete = true;
          continue;
        }

        const accounts = result.value.value as unknown as ParsedTokenAccount[];
        for (const account of accounts) {
          const info = account.account.data.parsed?.info;
          const mint = info?.mint;
          const rawAmount = info?.tokenAmount?.amount;
          const decimals = info?.tokenAmount?.decimals;

          if (
            typeof mint !== "string" ||
            typeof rawAmount !== "string" ||
            !/^\d+$/.test(rawAmount) ||
            typeof decimals !== "number" ||
            !Number.isInteger(decimals) ||
            decimals < 0 ||
            decimals > 255 ||
            /^0+$/.test(rawAmount)
          ) {
            continue;
          }

          const previous = holdingsByMint.get(mint);
          if (previous && previous.decimals === decimals) {
            previous.rawAmount = addIntegerStrings(previous.rawAmount, rawAmount);
          } else if (!previous) {
            holdingsByMint.set(mint, { mint, rawAmount, decimals });
          }
        }
      }

      const holdings = Array.from(holdingsByMint.values()).sort((a, b) => a.mint.localeCompare(b.mint));
      setWalletSolLamports(balanceResult.value);
      setWalletHoldings(holdings);
      setWalletAssetsOwnerAddress(address);
      setWalletAssetsUpdatedAt(new Date().toISOString());

      if (tokenProgramQueryIncomplete) {
        setWalletAssetsError("SOL balance loaded, but one token program could not be queried. Refresh to retry.");
      }
    } catch (caught) {
      setWalletAssetsError(
        caught instanceof Error
          ? caught.message
          : "Couldn't load wallet assets. The Solana RPC may be busy; please try again.",
      );
    } finally {
      setWalletAssetsLoading(false);
    }
  }, [address, connection, publicKey]);
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
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Wallet assets</p>
                <p className="mt-1 text-xs text-white/55">Read-only balances from Solana. No transaction is sent.</p>
              </div>
              <button
                type="button"
                onClick={handleRefreshWalletAssets}
                disabled={walletAssetsLoading}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/80 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={13} className={walletAssetsLoading ? "animate-spin" : ""} />
                {walletAssetsLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2.5">
              <span className="text-xs text-white/65">SOL balance</span>
              <span className="font-mono text-sm font-semibold">
                {walletAssetsOwnerAddress === address && walletSolLamports !== null
                  ? `${(walletSolLamports / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 9 })} SOL`
                  : "Not loaded"}
              </span>
            </div>

            <div className="mt-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
                <Coins size={14} /> SPL token holdings
                {walletAssetsOwnerAddress === address && (
                  <span className="font-normal text-white/45">({walletHoldings.length})</span>
                )}
              </div>

              {walletAssetsLoading && walletAssetsOwnerAddress !== address ? (
                <p className="mt-2 text-xs text-white/50">Loading wallet assets...</p>
              ) : walletAssetsOwnerAddress !== address ? (
                <p className="mt-2 text-xs leading-5 text-white/50">Select Refresh to load assets for this wallet.</p>
              ) : walletHoldings.length === 0 ? (
                <p className="mt-2 text-xs leading-5 text-white/50">No nonzero SPL token holdings were found for this wallet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {walletHoldings.slice(0, 8).map((holding) => (
                    <li key={holding.mint} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.035] px-3 py-2">
                      <a
                        href={`https://explorer.solana.com/address/${holding.mint}`}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 truncate font-mono text-xs text-lf-cyan hover:underline"
                        title={holding.mint}
                      >
                        {`${holding.mint.slice(0, 5)}...${holding.mint.slice(-5)}`}
                      </a>
                      <span className="shrink-0 text-xs text-white/80">
                        {formatWalletTokenAmount(holding.rawAmount, holding.decimals)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {walletAssetsOwnerAddress === address && walletHoldings.length > 8 && (
                <p className="mt-2 text-[11px] text-white/45">
                  Showing 8 of {walletHoldings.length} token mints. Additional holdings are not displayed here.
                </p>
              )}
            </div>

            {walletAssetsUpdatedAt && walletAssetsOwnerAddress === address && (
              <p className="mt-3 text-[10px] text-white/40">
                Updated {new Date(walletAssetsUpdatedAt).toLocaleTimeString()}
              </p>
            )}
            {walletAssetsError && (
              <p role="status" className="mt-3 text-xs leading-5 text-amber-200">{walletAssetsError}</p>
            )}
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
