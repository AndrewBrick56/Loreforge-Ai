"use client";

import { useState } from "react";
import { Sparkles, Loader2, AlertTriangle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ArtStyle, CharacterProfile } from "@/types/character";

type IdentityState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; profile: CharacterProfile };

interface CharacterIdentityPanelProps {
  description: string;
  style: ArtStyle;
  /** Lets the studio include the profile when the character is saved. */
  onProfileChange?: (profile: CharacterProfile | null) => void;
  /** Set once the character is saved; enables "Save profile to character". */
  savedCharacterId?: string | null;
}

type SyncState = "dirty" | "saving" | "synced" | "error";

export function CharacterIdentityPanel({ description, style, onProfileChange, savedCharacterId }: CharacterIdentityPanelProps) {
  const [state, setState] = useState<IdentityState>({ status: "idle" });
  const [editing, setEditing] = useState(false);
  const [sync, setSync] = useState<SyncState>("dirty");
  const [syncError, setSyncError] = useState<string | null>(null);

  async function handleSaveProfile() {
    if (state.status !== "ready" || !savedCharacterId) return;
    const p = state.profile;
    setSync("saving");
    setSyncError(null);
    try {
      const res = await fetch(`/api/characters/${savedCharacterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(p.name.trim() ? { name: p.name.trim() } : {}),
          lore: {
            title: p.title,
            personality: p.personality,
            catchphrase: p.catchphrase,
            originStory: p.originStory,
            likes: p.likes,
            dislikes: p.dislikes,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSync("error");
        setSyncError(data.error ?? "Couldn't save the profile.");
        return;
      }
      setSync("synced");
    } catch {
      setSync("error");
      setSyncError("Couldn't reach the server.");
    }
  }

  async function handleGenerate() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, style }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ status: "error", message: data.error ?? "Couldn't generate a profile." });
        return;
      }
      setState({ status: "ready", profile: data.profile });
      setSync("dirty");
      onProfileChange?.(data.profile);
    } catch {
      setState({ status: "error", message: "Couldn't reach the identity service. Try again." });
    }
  }

  function updateField<K extends keyof CharacterProfile>(key: K, value: CharacterProfile[K]) {
    if (state.status !== "ready") return;
    const next = { ...state.profile, [key]: value };
    setState({ status: "ready", profile: next });
    setSync("dirty");
    onProfileChange?.(next);
  }

  if (state.status === "idle") {
    return (
      <Button variant="secondary" className="w-full" onClick={handleGenerate}>
        <Sparkles size={15} /> Generate character profile
      </Button>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] py-4 text-sm text-lf-text-dim">
        <Loader2 size={15} className="animate-spin" /> Writing your character&apos;s story…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200">
        <p className="flex items-center gap-2">
          <AlertTriangle size={15} /> {state.message}
        </p>
        <Button variant="secondary" onClick={handleGenerate}>
          Try again
        </Button>
      </div>
    );
  }

  const { profile } = state;

  return (
    <div className="lf-glass space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-lf-text-faint">
          Character profile
        </span>
        <button
          onClick={() => setEditing((v) => !v)}
          className="flex items-center gap-1 text-xs text-lf-purple-light hover:underline cursor-pointer"
        >
          <Pencil size={12} /> {editing ? "Done" : "Edit"}
        </button>
      </div>

      {editing ? (
        <div className="space-y-2">
          <input
            value={profile.name}
            onChange={(e) => updateField("name", e.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm font-bold"
            placeholder="Name"
          />
          <input
            value={profile.title}
            onChange={(e) => updateField("title", e.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-lf-text-dim"
            placeholder="Title"
          />
          <textarea
            value={profile.personality}
            onChange={(e) => updateField("personality", e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
            placeholder="Personality"
          />
          <input
            value={profile.catchphrase}
            onChange={(e) => updateField("catchphrase", e.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm italic"
            placeholder="Catchphrase"
          />
          <textarea
            value={profile.originStory}
            onChange={(e) => updateField("originStory", e.target.value)}
            rows={3}
            className="w-full resize-none rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
            placeholder="Origin story"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <p className="font-display text-base font-bold">{profile.name}</p>
            <p className="text-xs text-lf-text-dim">{profile.title}</p>
          </div>
          <p className="text-sm text-lf-text-dim">{profile.personality}</p>
          <p className="text-sm italic text-lf-purple-light">&ldquo;{profile.catchphrase}&rdquo;</p>
          <p className="text-sm leading-relaxed text-lf-text-dim">{profile.originStory}</p>
          <div className="flex flex-wrap gap-3 pt-1 text-xs">
            <span className="text-lf-text-faint">Likes: {profile.likes.join(", ")}</span>
            <span className="text-lf-text-faint">Dislikes: {profile.dislikes.join(", ")}</span>
          </div>
        </div>
      )}

      {savedCharacterId && (
        <div className="flex items-center gap-3 border-t border-white/5 pt-3">
          <Button variant="secondary" onClick={handleSaveProfile} disabled={sync === "saving" || sync === "synced"}>
            {sync === "saving" ? "Saving…" : sync === "synced" ? "Profile saved" : "Save profile to character"}
          </Button>
          {sync === "error" && syncError && <span className="text-xs text-red-400">{syncError}</span>}
        </div>
      )}
    </div>
  );
}
