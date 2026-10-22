"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Palette, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { MemeCaptionTool } from "./meme-caption-tool";
import type { TokenIdea } from "@/lib/openai/generate-token-ideas";

const ASSET_TYPES = [
  { value: "logo", label: "Token logo", hint: "Square, transparent background" },
  { value: "pfp", label: "X profile picture", hint: "1:1, ready to upload" },
  { value: "banner", label: "X banner", hint: "3:1 wide header" },
  { value: "sticker", label: "Telegram sticker", hint: "512×512 WebP, transparent" },
  { value: "meme", label: "Reaction meme", hint: "Add your own caption after" },
] as const;

type AssetType = (typeof ASSET_TYPES)[number]["value"];

interface GeneratedAsset {
  id: string;
  type: AssetType;
  imageUrl: string;
  downloadUrl: string;
}

/** Owner-only tool on a character's page: generate memecoin branding assets that preserve the character's identity. */
export function BrandStudio({ characterId, characterName }: { characterId: string; characterName: string }) {
  const router = useRouter();
  const [type, setType] = useState<AssetType>("logo");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<GeneratedAsset | null>(null);

  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideas, setIdeas] = useState<TokenIdea[] | null>(null);
  const [ideasError, setIdeasError] = useState<string | null>(null);

  async function generateAsset() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/brand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't generate that asset.");
        return;
      }
      setLatest({ id: data.imageId, type, imageUrl: data.imageUrl, downloadUrl: data.downloadUrl ?? data.imageUrl });
      router.refresh(); // pulls the new asset into the gallery below via the server component
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function generateIdeas() {
    setIdeasLoading(true);
    setIdeasError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/token-ideas`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setIdeasError(data.error ?? "Couldn't generate ideas.");
        return;
      }
      setIdeas(data.ideas);
    } catch {
      setIdeasError("Couldn't reach the server.");
    } finally {
      setIdeasLoading(false);
    }
  }

  return (
    <GlassCard hover={false} className="space-y-5">
      <div className="flex items-center gap-2">
        <Palette size={16} className="text-lf-purple-light" />
        <h2 className="font-display text-base font-bold">Memecoin Branding Studio</h2>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-lf-text-faint">Token name &amp; ticker ideas</h3>
        {!ideas && (
          <Button variant="secondary" onClick={generateIdeas} disabled={ideasLoading}>
            {ideasLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Suggest names
          </Button>
        )}
        {ideasError && <p className="mt-2 text-xs text-red-400">{ideasError}</p>}
        {ideas && (
          <div className="space-y-1.5">
            {ideas.map((idea, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
                <span className="font-display font-bold">{idea.name}</span>{" "}
                <span className="text-lf-purple-light">${idea.ticker}</span>
                <p className="text-xs text-lf-text-dim">{idea.rationale}</p>
              </div>
            ))}
            <p className="text-xs text-lf-text-faint">Just creative suggestions — nothing here is registered or launched.</p>
            <button onClick={generateIdeas} className="text-xs text-lf-purple-light hover:underline cursor-pointer">
              Generate more
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-white/5 pt-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-lf-text-faint">Generate a brand asset</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ASSET_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                type === t.value ? "border-lf-purple-light bg-lf-purple/20 text-white" : "border-white/10 text-lf-text-dim hover:border-white/25"
              }`}
            >
              <div className="font-medium">{t.label}</div>
              <div className="text-[11px] text-lf-text-faint">{t.hint}</div>
            </button>
          ))}
        </div>

        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={500}
          placeholder={type === "meme" ? 'Describe the reaction, e.g. "shocked, spitting out coffee"' : "Optional extra direction"}
          className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm placeholder:text-lf-text-faint focus:border-lf-purple-light focus:outline-none"
        />
        <Button variant="primary" className="mt-3" onClick={generateAsset} disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {busy ? "Generating…" : "Generate"}
        </Button>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        {latest && (
          <div className="mt-4 space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={latest.imageUrl} alt={`Generated ${latest.type}`} className="mx-auto max-h-64 rounded-md" style={{ background: latest.type === "logo" || latest.type === "sticker" ? "repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 16px 16px" : undefined }} />
            <a href={latest.downloadUrl} download={`${characterName}-${latest.type}.${latest.type === "sticker" ? "webp" : "png"}`} className="block text-center text-xs text-lf-purple-light hover:underline">
              Download
            </a>
            {latest.type === "meme" && <MemeCaptionTool imageUrl={latest.imageUrl} fileNamePrefix={characterName} />}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
