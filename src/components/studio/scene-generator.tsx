"use client";

import { useState } from "react";
import { Clapperboard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ArtStyle, AspectRatio } from "@/types/character";

export interface SceneResult {
  imageUrl: string;
  downloadUrl?: string;
  pendingImagePath?: string | null;
  imageToken?: string | null;
  /** true when the server already stored this scene on a saved character */
  persisted: boolean;
}

interface SceneGeneratorProps {
  characterImageUrl: string; // the current character's displayed image — a signed Storage URL or (fallback) a data: URL
  /** Preferred reference for an unsaved draft: lets the server pull the reference straight from Storage instead of re-sending bytes. */
  characterPendingImagePath?: string | null;
  style: ArtStyle;
  aspectRatio: AspectRatio;
  savedCharacterId: string | null;
  onSceneGenerated: (result: SceneResult) => void;
}

/**
 * "Generate my pigeon driving a Lamborghini."
 *
 * Saved character  -> the server loads the character's cover image from
 *                     private storage as the reference and stores the new
 *                     scene on that character automatically.
 * Unsaved (draft)  -> the current image is sent as the reference and the
 *                     result stays a draft until you save it.
 */
export function SceneGenerator({ characterImageUrl, characterPendingImagePath, style, aspectRatio, savedCharacterId, onSceneGenerated }: SceneGeneratorProps) {
  const [scenePrompt, setScenePrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleGenerate() {
    if (!scenePrompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      let res: Response;
      if (savedCharacterId) {
        res = await fetch(`/api/characters/${savedCharacterId}/scenes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: scenePrompt.trim(), aspectRatio, style }),
        });
      } else {
        // Preferred: reference the existing Storage draft directly (no
        // re-encoding, no body-size concern). Only falls back to inlining
        // base64 when the current image isn't in Storage at all (i.e. it's
        // a data: URL, meaning Storage wasn't configured at generate time).
        const body = characterPendingImagePath
          ? { mode: "new_scene", referencePendingImagePath: characterPendingImagePath, prompt: scenePrompt.trim(), style, aspectRatio }
          : { mode: "new_scene", referenceImageBase64: characterImageUrl.split(",")[1] ?? "", prompt: scenePrompt.trim(), style, aspectRatio };
        res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't generate that scene.");
        return;
      }
      onSceneGenerated({
        imageUrl: data.imageUrl,
        downloadUrl: data.downloadUrl,
        pendingImagePath: data.pendingImagePath,
        imageToken: data.imageToken,
        persisted: Boolean(savedCharacterId),
      });
      setNotice(savedCharacterId ? "Scene generated and added to your saved character." : null);
      setScenePrompt("");
    } catch {
      setError("Couldn't reach the generation service.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lf-glass space-y-2 p-4">
      <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-lf-text-faint">
        <Clapperboard size={13} /> Generate a new scene with this character
      </label>
      <div className="flex gap-2">
        <input
          value={scenePrompt}
          onChange={(e) => setScenePrompt(e.target.value)}
          placeholder='e.g. "driving a Lamborghini through Monaco"'
          className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm placeholder:text-lf-text-faint focus:border-lf-purple-light focus:outline-none"
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          maxLength={2000}
        />
        <Button variant="primary" disabled={!scenePrompt.trim() || loading} onClick={handleGenerate}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : "Generate"}
        </Button>
      </div>
      <p className="text-xs text-lf-text-faint">
        {savedCharacterId
          ? "Scenes are added to your saved character automatically."
          : "Save the character first to keep its scenes together in your collection."}
      </p>
      {notice && <p className="text-xs text-lf-cyan">{notice}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
