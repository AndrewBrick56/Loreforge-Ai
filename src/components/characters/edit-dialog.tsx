"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LoreDTO } from "@/lib/characters-data";

const field = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm placeholder:text-lf-text-faint focus:border-lf-purple-light focus:outline-none";

const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8);

export function EditCharacterDialog({ characterId, initialName, initialLore, onClose, onSaved }: {
  characterId: string; initialName: string; initialLore: LoreDTO | null; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [title, setTitle] = useState(initialLore?.title ?? "");
  const [personality, setPersonality] = useState(initialLore?.personality ?? "");
  const [catchphrase, setCatchphrase] = useState(initialLore?.catchphrase ?? "");
  const [originStory, setOriginStory] = useState(initialLore?.originStory ?? "");
  const [likes, setLikes] = useState((initialLore?.likes ?? []).join(", "));
  const [dislikes, setDislikes] = useState((initialLore?.dislikes ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (!name.trim()) {
      setError("A character needs a name.");
      return;
    }
    setBusy(true);
    setError(null);
    const hasLore = Boolean(initialLore) || [title, personality, catchphrase, originStory, likes, dislikes].some((v) => v.trim());
    try {
      const res = await fetch(`/api/characters/${characterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...(hasLore
            ? { lore: { title, personality, catchphrase, originStory, likes: toList(likes), dislikes: toList(dislikes) } }
            : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save your changes.");
        return;
      }
      onSaved();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Edit character"
        className="lf-glass max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Edit character</h2>
          <button onClick={onClose} aria-label="Close" className="text-lf-text-dim hover:text-white cursor-pointer"><X size={18} /></button>
        </div>
        <div><label className="mb-1 block text-xs text-lf-text-dim">Name</label>
          <input className={field} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="mb-1 block text-xs text-lf-text-dim">Title</label>
          <input className={field} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className="mb-1 block text-xs text-lf-text-dim">Personality</label>
          <textarea className={`${field} resize-none`} rows={2} value={personality} maxLength={600} onChange={(e) => setPersonality(e.target.value)} /></div>
        <div><label className="mb-1 block text-xs text-lf-text-dim">Catchphrase</label>
          <input className={field} value={catchphrase} maxLength={200} onChange={(e) => setCatchphrase(e.target.value)} /></div>
        <div><label className="mb-1 block text-xs text-lf-text-dim">Origin story</label>
          <textarea className={`${field} resize-none`} rows={4} value={originStory} maxLength={1500} onChange={(e) => setOriginStory(e.target.value)} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs text-lf-text-dim">Likes (comma separated)</label>
            <input className={field} value={likes} onChange={(e) => setLikes(e.target.value)} /></div>
          <div><label className="mb-1 block text-xs text-lf-text-dim">Dislikes (comma separated)</label>
            <input className={field} value={dislikes} onChange={(e) => setDislikes(e.target.value)} /></div>
        </div>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy && <Loader2 size={15} className="animate-spin" />} Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
