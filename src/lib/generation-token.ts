import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Proof-of-origin for generated images.
 *
 * Problem: "Save to collection" receives image bytes from the browser. If
 * the server saved whatever it was sent, anyone could upload arbitrary
 * pictures into the public Explore feed by calling the API directly.
 *
 * Fix: when /api/generate produces an image it also returns a signed token
 * (HMAC over the image's SHA-256). Saving requires a token that matches the
 * bytes, so only images this server actually generated can be saved.
 * The token cannot be forged without the server secret.
 */
function secret(): string | null {
  if (process.env.GENERATION_SIGNING_SECRET) return process.env.GENERATION_SIGNING_SECRET;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return "lf-derived:" + process.env.SUPABASE_SERVICE_ROLE_KEY;
  return null;
}

export function signingAvailable(): boolean {
  return secret() !== null;
}

function mac(bytes: Buffer, key: string): Buffer {
  const digest = createHash("sha256").update(bytes).digest();
  return createHmac("sha256", key).update(digest).digest();
}

export function signImage(bytes: Buffer): string | null {
  const key = secret();
  return key ? mac(bytes, key).toString("base64url") : null;
}

export function verifyImageToken(bytes: Buffer, token: string): boolean {
  const key = secret();
  if (!key) return false;
  const expected = mac(bytes, key);
  let given: Buffer;
  try {
    given = Buffer.from(token, "base64url");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}
