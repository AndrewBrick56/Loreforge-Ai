import { ART_STYLES, type ArtStyle } from "@/types/character";

export function styleLabel(style: ArtStyle | string): string {
  return ART_STYLES.find((s) => s.value === style)?.label ?? style;
}

/** Fixed locale + UTC so server and browser render identical text (no hydration mismatch). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function downloadName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${slug || "character"}.png`;
}
