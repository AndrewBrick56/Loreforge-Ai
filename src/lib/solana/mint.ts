import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { resolveSolanaEndpoint } from "@/lib/solana/network";

// Well-known, stable program ids — safe to hardcode, unchanged since launch.
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const RPC_TIMEOUT_MS = 8000;

function getConnection(): Connection {
  return new Connection(resolveSolanaEndpoint(), "confirmed");
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export type MintFormatCheck = { ok: true } | { ok: false; reason: string };

/** Cheap, synchronous check: is this even a well-formed base58 Solana public key? No network call. */
export function checkMintAddressFormat(address: string): MintFormatCheck {
  const trimmed = address.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
    return { ok: false, reason: "That doesn't look like a Solana address (expected 32-44 base58 characters)." };
  }
  try {
    // PublicKey's constructor validates it decodes to exactly 32 bytes.
    new PublicKey(trimmed);
    return { ok: true };
  } catch {
    return { ok: false, reason: "That address doesn't decode to a valid Solana public key." };
  }
}

export type MintOnChainCheck =
  | { status: "verified"; decimals: number }
  | { status: "not_a_mint"; reason: string }
  | { status: "unverifiable"; reason: string }; // RPC unreachable/timed out — not the same as "invalid"

/**
 * Best-effort on-chain check: does this address actually belong to an
 * initialized SPL Token or Token-2022 mint account? This is a real,
 * un-mocked call to a Solana RPC endpoint (parses the raw Mint account
 * layout manually rather than adding @solana/spl-token as a dependency).
 *
 * "unverifiable" (RPC down/slow) is intentionally distinct from
 * "not_a_mint" (RPC responded and it's definitely not a mint): callers
 * should let a save proceed with verified_on_chain=false on "unverifiable"
 * rather than hard-blocking on RPC flakiness, but must reject "not_a_mint".
 */
export async function checkMintOnChain(address: string): Promise<MintOnChainCheck> {
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(address.trim());
  } catch {
    return { status: "not_a_mint", reason: "Invalid address." };
  }

  try {
    const info = await withTimeout(getConnection().getAccountInfo(pubkey), RPC_TIMEOUT_MS);
    if (!info) return { status: "not_a_mint", reason: "No account exists at this address on-chain." };

    const owner = info.owner.toBase58();
    if (owner !== TOKEN_PROGRAM_ID && owner !== TOKEN_2022_PROGRAM_ID) {
      return { status: "not_a_mint", reason: "This address exists on-chain but isn't owned by the Token program — it isn't a token mint." };
    }
    // The base SPL Mint layout is exactly 82 bytes. SPL token accounts are
    // normally 165 bytes and also use byte 45 for ordinary account data, so
    // checking only `data[45] === 1` can incorrectly accept a token account.
    // Legacy SPL Token mints have no extensions and must be exactly 82 bytes.
    // Token-2022 extensions use the mint base layout plus padding through byte
    // 164 and an account-type discriminator at byte 165 (1 = Mint).
    if (owner === TOKEN_PROGRAM_ID && info.data.length !== 82) {
      return { status: "not_a_mint", reason: "This account does not have the expected SPL Token mint layout." };
    }
    if (owner === TOKEN_2022_PROGRAM_ID) {
      const isBaseMint = info.data.length === 82;
      const isExtendedMint = info.data.length >= 166 && info.data[165] === 1;
      if (!isBaseMint && !isExtendedMint) {
        return { status: "not_a_mint", reason: "This account does not have a valid Token-2022 mint layout." };
      }
      // Token-2022 extension-bearing mint accounts reserve bytes 82..164
      // before the account-type byte. Reject malformed/non-canonical padding.
      if (isExtendedMint && info.data.subarray(82, 165).some((byte) => byte !== 0)) {
        return { status: "not_a_mint", reason: "This Token-2022 account has an invalid mint layout." };
      }
    }
    if (info.data[45] !== 1) {
      return { status: "not_a_mint", reason: "This mint account exists but hasn't been initialized." };
    }
    const decimals = info.data[44];
    return { status: "verified", decimals };
  } catch {
    return { status: "unverifiable", reason: "Couldn't reach a Solana RPC endpoint to verify this on-chain right now." };
  }
}
