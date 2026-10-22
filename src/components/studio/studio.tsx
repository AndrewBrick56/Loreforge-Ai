"use client";

import { useState } from "react";
import { Wand2, Info } from "lucide-react";
import { ImageUploader } from "./image-uploader";
import { StylePicker } from "./style-picker";
import { AspectRatioPicker } from "./aspect-ratio-picker";
import { GenerationResultPanel, type GenerationState, type SaveState } from "./generation-result-panel";
import { CharacterIdentityPanel } from "./character-identity-panel";
import { SceneGenerator, type SceneResult } from "./scene-generator";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { fileToBase64 } from "@/lib/file-to-base64";
import type { ArtStyle, AspectRatio, CharacterProfile } from "@/types/character";

/** The settings an image was actually generated with (the form may have changed since). */
interface GenMeta {
  style: ArtStyle;
  aspectRatio: AspectRatio;
  prompt: string;
  auto: boolean;
}

export function Studio() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<ArtStyle>("3d_animation");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [autoDirection, setAutoDirection] = useState(false);
  const [genState, setGenState] = useState<GenerationState>({ status: "idle" });
  const [genMeta, setGenMeta] = useState<GenMeta | null>(null);
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [characterName, setCharacterName] = useState("");
  const [profile, setProfile] = useState<CharacterProfile | null>(null);

  const canGenerate = Boolean(file) && (prompt.trim().length > 0 || autoDirection) && genState.status !== "loading";
  const savedCharacterId = saveState.status === "saved" ? saveState.characterId : null;

  async function handleGenerate() {
    if (!file) return;
    const meta: GenMeta = { style, aspectRatio, prompt: prompt.trim(), auto: autoDirection };
    setGenState({ status: "loading" });
    setSaveState({ status: "idle" }); // a new generation is a new, unsaved character
    setProfile(null);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          prompt: meta.prompt || "Transform this subject into a striking original character.",
          style: meta.style,
          aspectRatio: meta.aspectRatio,
          autoDirection: meta.auto,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenState({ status: "error", message: data.error ?? "Generation failed. Please try again." });
        return;
      }
      setGenMeta(meta);
      setSourceDataUrl(`data:${mimeType};base64,${base64}`); // kept so "Save" can store the original photo too
      setGenState({
        status: "success",
        imageUrl: data.imageUrl,
        downloadUrl: data.downloadUrl,
        pendingImagePath: data.pendingImagePath ?? null,
        imageToken: data.imageToken ?? null,
      });
    } catch {
      setGenState({ status: "error", message: "Couldn't reach the generation service. Check your connection and try again." });
    }
  }

  async function handleSave() {
    if (genState.status !== "success" || !genMeta) return;
    if (!genState.imageToken) {
      setSaveState({
        status: "error",
        message: "Saving isn't available on this server yet — it needs Supabase configured (see the README).",
      });
      return;
    }
    setSaveState({ status: "saving" });
    try {
      // Preferred: the image already lives in Storage, so just tell the
      // server which pending object to finalize (tiny request body,
      // regardless of image size). Only falls back to sending the full
      // base64 payload when Storage wasn't configured at generate time.
      const imagePayload = genState.pendingImagePath
        ? { pendingImagePath: genState.pendingImagePath }
        : { imageDataUrl: genState.imageUrl };
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...imagePayload,
          imageToken: genState.imageToken,
          sourceImageDataUrl: sourceDataUrl ?? undefined,
          name: characterName.trim() || profile?.name?.trim() || undefined,
          style: genMeta.style,
          prompt: genMeta.auto ? "" : genMeta.prompt,
          aspectRatio: genMeta.aspectRatio,
          lore: profile
            ? {
                title: profile.title,
                personality: profile.personality,
                catchphrase: profile.catchphrase,
                originStory: profile.originStory,
                likes: profile.likes,
                dislikes: profile.dislikes,
              }
            : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setSaveState({ status: "error", message: "You need to be signed in to save characters.", needsAuth: true });
      } else if (!res.ok) {
        setSaveState({ status: "error", message: data.error ?? "Couldn't save your character." });
      } else {
        setSaveState({ status: "saved", characterId: data.id });
      }
    } catch {
      setSaveState({ status: "error", message: "Couldn't reach the server. Please try again." });
    }
  }

  function handleSceneGenerated(result: SceneResult) {
    setGenState({
      status: "success",
      imageUrl: result.imageUrl,
      downloadUrl: result.downloadUrl,
      pendingImagePath: result.pendingImagePath ?? null,
      imageToken: result.imageToken ?? null,
    });
    // An unsaved scene is saved with the aspect ratio it was actually generated at.
    if (!result.persisted) setGenMeta((m) => (m ? { ...m, aspectRatio } : m));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Character Creation Studio</h1>
        <p className="mt-2 max-w-xl text-sm text-lf-text-dim">
          Upload a photo, describe your transformation, pick a style — LoreForge builds a
          brand-new character image from it.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard hover={false} className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium">1. Upload a photo</label>
            <ImageUploader
              previewUrl={previewUrl}
              onImageSelected={(f, url) => {
                setFile(f);
                setPreviewUrl(url);
              }}
              onClear={() => {
                setFile(null);
                setPreviewUrl(null);
              }}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="prompt" className="block text-sm font-medium">
                2. Describe your character
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-lf-text-dim">
                <input
                  type="checkbox"
                  checked={autoDirection}
                  onChange={(e) => setAutoDirection(e.target.checked)}
                  className="accent-lf-purple"
                />
                Auto creative direction
              </label>
            </div>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={autoDirection}
              maxLength={2000}
              placeholder='e.g. "Transform this pigeon into an arrogant billionaire CEO who believes he owns the internet."'
              rows={3}
              className="w-full resize-none rounded-lg border border-white/10 bg-black/30 p-3 text-sm placeholder:text-lf-text-faint focus:border-lf-purple-light focus:outline-none disabled:opacity-40"
            />
            {autoDirection && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-lf-text-faint">
                <Info size={12} /> LoreForge will invent a creative direction for you.
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">3. Choose your artistic style</label>
            <StylePicker value={style} onChange={setStyle} />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">4. Aspect ratio</label>
            <AspectRatioPicker value={aspectRatio} onChange={setAspectRatio} />
          </div>

          <Button variant="primary" className="w-full" disabled={!canGenerate} onClick={handleGenerate}>
            <Wand2 size={16} /> Generate character
          </Button>
        </GlassCard>

        <div>
          <label className="mb-2 block text-sm font-medium">Result</label>
          <GenerationResultPanel
            state={genState}
            saveState={saveState}
            onRetry={handleGenerate}
            onSaveToCollection={handleSave}
          />

          {genState.status === "success" && genMeta && (
            <div className="mt-4 space-y-4">
              {saveState.status !== "saved" && (
                <div>
                  <label htmlFor="char-name" className="mb-1.5 block text-xs text-lf-text-dim">
                    Character name (optional)
                  </label>
                  <input
                    id="char-name"
                    value={characterName}
                    onChange={(e) => setCharacterName(e.target.value)}
                    maxLength={80}
                    placeholder="Untitled Character"
                    className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm placeholder:text-lf-text-faint focus:border-lf-purple-light focus:outline-none"
                  />
                </div>
              )}
              <CharacterIdentityPanel
                description={genMeta.auto ? "A creative fictional character transformation" : genMeta.prompt}
                style={genMeta.style}
                savedCharacterId={savedCharacterId}
                onProfileChange={(p) => {
                  setProfile(p);
                  if (p) setCharacterName((prev) => (prev.trim() ? prev : p.name));
                }}
              />
              <SceneGenerator
                characterImageUrl={genState.imageUrl}
                characterPendingImagePath={genState.pendingImagePath}
                style={genMeta.style}
                aspectRatio={aspectRatio}
                savedCharacterId={savedCharacterId}
                onSceneGenerated={handleSceneGenerated}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
