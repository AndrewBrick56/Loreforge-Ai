$ErrorActionPreference = "Stop"
$projectRoot = (Get-Location).Path

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "package.json"))) {
    Write-Host "ERROR: Run this from the LoreForge project root (the folder containing package.json)." -ForegroundColor Red
    return
}

$required = @(
    "src\components\layout\connect-wallet-button.tsx",
    "src\lib\auth.ts",
    "src\lib\supabase\server.ts",
    "supabase\migrations"
)
foreach ($relative in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $relative))) {
        Write-Host "ERROR: Required project path not found: $relative. No changes made." -ForegroundColor Red
        return
    }
}

$authPath = Join-Path $projectRoot "src\lib\auth.ts"
$authText = [System.IO.File]::ReadAllText($authPath)
$serverPath = Join-Path $projectRoot "src\lib\supabase\server.ts"
$serverText = [System.IO.File]::ReadAllText($serverPath)
$buttonPath = Join-Path $projectRoot "src\components\layout\connect-wallet-button.tsx"
$buttonText = [System.IO.File]::ReadAllText($buttonPath)

if ($authText -notmatch 'requireUser' -or $authText -notmatch 'isErrorResponse') {
    Write-Host "ERROR: Expected LoreForge auth helpers weren't found. No changes made." -ForegroundColor Red
    return
}
if ($serverText -notmatch 'createAdminClient' -or $serverText -notmatch 'hasServiceRole') {
    Write-Host "ERROR: Expected Supabase admin helper wasn't found. No changes made." -ForegroundColor Red
    return
}
if ($buttonText -notmatch 'useWallet' -or $buttonText -notmatch 'useWalletModal') {
    Write-Host "ERROR: Connect Wallet component differs from the expected Wallet Adapter version. No changes made." -ForegroundColor Red
    return
}

$migrationName = "20261023220000_wallet_account_linking.sql"
$migrationPath = Join-Path $projectRoot ("supabase\migrations\" + $migrationName)
if (Test-Path -LiteralPath $migrationPath) {
    Write-Host "ERROR: Migration already exists: $migrationName. No files were changed." -ForegroundColor Red
    return
}

$newPaths = @(
    "src\app\api\wallet\challenge\route.ts",
    "src\app\api\wallet\verify\route.ts",
    "src\app\api\wallet\link\route.ts"
)
foreach ($relative in $newPaths) {
    if (Test-Path -LiteralPath (Join-Path $projectRoot $relative)) {
        Write-Host "ERROR: Wallet route already exists: $relative. No files were changed." -ForegroundColor Red
        return
    }
}

$files = [ordered]@{}
$files["src\app\api\wallet\challenge\route.ts"] = @'
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { isErrorResponse, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireUser({ needsServiceRole: true });
  if (isErrorResponse(auth)) return auth;

  let body: { walletAddress?: unknown } | null;
  try {
    body = (await request.json()) as { walletAddress?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  if (typeof body?.walletAddress !== "string" || body.walletAddress.length > 64) {
    return NextResponse.json({ error: "Enter a valid Solana wallet address." }, { status: 400 });
  }

  let walletAddress: string;
  try {
    const key = new PublicKey(body.walletAddress);
    walletAddress = key.toBase58();
    if (walletAddress !== body.walletAddress) throw new Error("Non-canonical address");
  } catch {
    return NextResponse.json({ error: "That Solana wallet address is invalid." }, { status: 400 });
  }

  const now = new Date();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
  const nonce = randomUUID();
  const origin = new URL(request.url).origin;
  const message = [
    "LoreForge Wallet Verification",
    "",
    `Domain: ${origin}`,
    "Action: Link this Solana wallet to my LoreForge account.",
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expiresAt}`,
    "",
    "This signature only verifies wallet control. It does not authorize a blockchain transaction.",
  ].join("\n");

  const admin = createAdminClient();
  // Keep challenge storage small. Challenges are single-use and expire after five minutes.
  const { error: cleanupError } = await admin
    .from("wallet_link_challenges")
    .delete()
    .lt("expires_at", now.toISOString());
  if (cleanupError) {
    console.error("[LoreForge] Wallet challenge cleanup failed:", cleanupError.message);
  }

  const { error } = await admin.from("wallet_link_challenges").insert({
    nonce,
    user_id: auth.user.id,
    wallet_address: walletAddress,
    message,
    expires_at: expiresAt,
  });

  if (error) {
    console.error("[LoreForge] Wallet challenge creation failed:", error.message);
    return NextResponse.json({ error: "Couldn't start wallet verification. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ nonce, message, expiresAt }, { headers: { "Cache-Control": "no-store" } });
}
'@

$files["src\app\api\wallet\verify\route.ts"] = @'
import { createPublicKey, verify as verifyEd25519Signature } from "node:crypto";
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { isErrorResponse, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireUser({ needsServiceRole: true });
  if (isErrorResponse(auth)) return auth;

  let body: { nonce?: unknown; walletAddress?: unknown; signatureBase64?: unknown } | null;
  try {
    body = (await request.json()) as {
      nonce?: unknown;
      walletAddress?: unknown;
      signatureBase64?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  if (
    typeof body?.nonce !== "string" || !UUID_RE.test(body.nonce) ||
    typeof body.walletAddress !== "string" || body.walletAddress.length > 64 ||
    typeof body.signatureBase64 !== "string" || body.signatureBase64.length > 128
  ) {
    return NextResponse.json({ error: "The wallet verification request is invalid." }, { status: 400 });
  }

  let walletAddress: string;
  let publicKeyBytes: Buffer;
  try {
    const key = new PublicKey(body.walletAddress);
    walletAddress = key.toBase58();
    if (walletAddress !== body.walletAddress) throw new Error("Non-canonical address");
    publicKeyBytes = Buffer.from(key.toBytes());
  } catch {
    return NextResponse.json({ error: "That Solana wallet address is invalid." }, { status: 400 });
  }

  const signature = Buffer.from(body.signatureBase64, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== body.signatureBase64) {
    return NextResponse.json({ error: "The wallet signature format is invalid." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: challenge, error: lookupError } = await admin
    .from("wallet_link_challenges")
    .select("nonce, user_id, wallet_address, message, expires_at, consumed_at")
    .eq("nonce", body.nonce)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (lookupError) {
    console.error("[LoreForge] Wallet challenge lookup failed:", lookupError.message);
    return NextResponse.json({ error: "Couldn't verify the wallet request. Please try again." }, { status: 500 });
  }
  if (!challenge) {
    return NextResponse.json({ error: "Wallet challenge not found. Start verification again." }, { status: 404 });
  }
  if (challenge.consumed_at) {
    return NextResponse.json({ error: "This wallet challenge has already been used. Start again." }, { status: 409 });
  }
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Wallet challenge expired. Start verification again." }, { status: 410 });
  }
  if (challenge.wallet_address !== walletAddress) {
    return NextResponse.json({ error: "The signed wallet doesn't match this challenge." }, { status: 400 });
  }

  let signatureIsValid = false;
  try {
    // Solana public keys are raw 32-byte Ed25519 keys; wrap as an SPKI key for Node crypto.
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const keyObject = createPublicKey({
      key: Buffer.concat([spkiPrefix, publicKeyBytes]),
      format: "der",
      type: "spki",
    });
    signatureIsValid = verifyEd25519Signature(
      null,
      Buffer.from(challenge.message, "utf8"),
      keyObject,
      signature,
    );
  } catch {
    signatureIsValid = false;
  }

  if (!signatureIsValid) {
    return NextResponse.json({ error: "Wallet signature verification failed. No wallet was linked." }, { status: 401 });
  }

  const now = new Date().toISOString();
  // Consume the nonce atomically so the same proof cannot be replayed.
  const { data: consumed, error: consumeError } = await admin
    .from("wallet_link_challenges")
    .update({ consumed_at: now })
    .eq("nonce", body.nonce)
    .eq("user_id", auth.user.id)
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("nonce")
    .maybeSingle();

  if (consumeError) {
    console.error("[LoreForge] Wallet challenge consumption failed:", consumeError.message);
    return NextResponse.json({ error: "Couldn't complete wallet verification. Please start again." }, { status: 500 });
  }
  if (!consumed) {
    return NextResponse.json({ error: "This wallet challenge is expired or already used. Start again." }, { status: 409 });
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .update({ wallet_address: walletAddress, wallet_verified_at: now })
    .eq("id", auth.user.id)
    .select("id")
    .maybeSingle();

  if (profileError) {
    if (profileError.code === "23505") {
      return NextResponse.json({ error: "This wallet is already linked to another LoreForge account." }, { status: 409 });
    }
    console.error("[LoreForge] Verified wallet could not be saved:", profileError.message);
    return NextResponse.json({ error: "The wallet was verified, but couldn't be linked to this account." }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "Your LoreForge profile wasn't found. Please sign in again." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, walletAddress, walletVerifiedAt: now }, { headers: { "Cache-Control": "no-store" } });
}
'@

$files["src\app\api\wallet\link\route.ts"] = @'
import { NextResponse } from "next/server";
import { isErrorResponse, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser({ needsServiceRole: true });
  if (isErrorResponse(auth)) return auth;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("wallet_address, wallet_verified_at")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) {
    console.error("[LoreForge] Linked wallet lookup failed:", error.message);
    return NextResponse.json({ error: "Couldn't load your linked wallet." }, { status: 500 });
  }

  return NextResponse.json({
    walletAddress: data?.wallet_address ?? null,
    walletVerifiedAt: data?.wallet_verified_at ?? null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  const auth = await requireUser({ needsServiceRole: true });
  if (isErrorResponse(auth)) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ wallet_address: null, wallet_verified_at: null })
    .eq("id", auth.user.id);

  if (error) {
    console.error("[LoreForge] Wallet unlink failed:", error.message);
    return NextResponse.json({ error: "Couldn't unlink this wallet. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
'@

$files["src\components\layout\connect-wallet-button.tsx"] = @'
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
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
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
    setOpen((value) => !value);
    setNotice(null);
    setError(null);
  }, [publicKey, setVisible]);

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
        {connecting ? "Connecting…" : address ? shortenAddress(address) : "Connect Wallet"}
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
                {busy === "verify" ? "Waiting for signature…" : "Verify & link wallet"}
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
            Wallet linking proves control of the wallet address only. It doesn't prove ownership of a token, coin project, or character.
          </p>

          <button type="button" onClick={handleDisconnect} disabled={busy !== null} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/75 transition hover:bg-white/5 disabled:opacity-50">
            <Wallet size={14} /> Disconnect from this browser
          </button>
        </div>
      )}
    </div>
  );
}
'@

$files[$migrationName] = @'
-- Optional, proof-of-control Solana wallet linking for LoreForge profiles.
-- This verifies the wallet address only. It does not prove ownership of a token project.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wallet_address text,
  ADD COLUMN IF NOT EXISTS wallet_verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_wallet_address_unique_idx
  ON public.profiles (wallet_address)
  WHERE wallet_address IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.wallet_link_challenges (
  nonce uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address text NOT NULL CHECK (wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  message text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_link_challenges_user_created_idx
  ON public.wallet_link_challenges (user_id, created_at DESC);

ALTER TABLE public.wallet_link_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wallet_link_challenges FROM anon, authenticated;
GRANT ALL ON TABLE public.wallet_link_challenges TO service_role;

-- Profile clients may still edit normal profile fields, but cannot claim a wallet
-- by directly updating these two columns. Only server-side service-role verification
-- is allowed to change the wallet-link fields.
CREATE OR REPLACE FUNCTION public.protect_profile_wallet_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.wallet_address IS DISTINCT FROM OLD.wallet_address
      OR NEW.wallet_verified_at IS DISTINCT FROM OLD.wallet_verified_at)
     AND COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Wallet link fields can only be changed by server-side verification.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_wallet_fields ON public.profiles;
CREATE TRIGGER profiles_protect_wallet_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_wallet_fields();

COMMENT ON COLUMN public.profiles.wallet_address IS
  'Optional Solana wallet address linked after server-verified message signing.';
COMMENT ON COLUMN public.profiles.wallet_verified_at IS
  'Time the profile linked this wallet by signing a single-use server challenge.';
'@

# Avoid overwriting pre-existing API routes or migrations.
foreach ($relative in $newPaths) {
    if (-not $files.Contains($relative)) { continue }
}

$backupRoot = Join-Path $projectRoot (".loreforge-code-backups\wallet-linking-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path (Join-Path $backupRoot "src\components\layout") -Force | Out-Null
Copy-Item -LiteralPath $buttonPath -Destination (Join-Path $backupRoot "src\components\layout\connect-wallet-button.tsx")

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
foreach ($entry in $files.GetEnumerator()) {
    if ($entry.Key -eq $migrationName) {
        $destinationPath = $migrationPath
    } else {
        $destinationPath = Join-Path $projectRoot $entry.Key
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $destinationPath) -Force | Out-Null
    [System.IO.File]::WriteAllText($destinationPath, [string]$entry.Value, $utf8NoBom)
    Write-Host "Created: $($entry.Key)" -ForegroundColor Green
}

[System.IO.File]::WriteAllText($buttonPath, [string]$files["src\components\layout\connect-wallet-button.tsx"], $utf8NoBom)
Write-Host "Updated: src\components\layout\connect-wallet-button.tsx" -ForegroundColor Green
Write-Host "Backup:  $backupRoot" -ForegroundColor Cyan
Write-Host "`nWallet linking code added. No database changes have been applied yet." -ForegroundColor Yellow
Write-Host "Next: inspect migration with: npx --yes supabase db push --dry-run"
Write-Host "Then run separately: npm run lint ; npx tsc --noEmit"
