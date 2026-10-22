/**
 * Only allow same-site relative paths in `?next=` style parameters.
 * Without this, /login?next=https://evil.example would be an open redirect
 * that phishing links could abuse. "//evil.example" and "/\evil.example"
 * are also treated as absolute by browsers, so they are rejected too.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/characters"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
