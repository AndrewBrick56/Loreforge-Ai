"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Clapperboard, Pencil, Trash2, Globe, Lock, Loader2, Heart, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareButton } from "./share-button";
import { EditCharacterDialog } from "./edit-dialog";
import { formatDate, styleLabel } from "@/lib/format";
import type { MyCharacterDTO } from "@/lib/characters-data";

export function CharacterCard({ character: c }: { character: MyCharacterDTO }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const [scenePrompt, setScenePrompt] = useState("");
  const [sceneBusy, setSceneBusy] = useState(false);
  const [latestScene, setLatestScene] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "publish" | "delete">(null);
  const [error, setError] = useState<string | null>(null);

  async function setPublic(next: boolean) {
    setBusy("publish");
    setError(null);
    try {
      const res = await fetch(`/api/characters/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: next }),
      });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't change visibility.");
      else router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${c.name}" and all ${c.imageCount} of its images? This can't be undone.`)) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/characters/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Couldn't delete the character.");
        setBusy(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(null);
    }
  }

  async function generateScene() {
    if (!scenePrompt.trim() || sceneBusy) return;
    setSceneBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${c.id}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: scenePrompt.trim(), aspectRatio: "1:1" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't generate that scene.");
        return;
      }
      setLatestScene(data.imageUrl);
      setScenePrompt("");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSceneBusy(false);
    }
  }

  return (
    <article className="lf-glass overflow-hidden">
      <Link href={`/c/${c.id}`} className="block">
        {c.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.coverUrl} alt={c.name} className="aspect-square w-full bg-black/40 object-cover" />
        ) : (
          <div className="grid aspect-square place-items-center bg-black/40 text-sm text-lf-text-faint">Image unavailable</div>
        )}
      </Link>

      <div className="space-y-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-base font-bold leading-tight">{c.name}</h3>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
              c.isPublic ? "bg-lf-cyan/15 text-lf-cyan" : "bg-white/5 text-lf-text-faint"}`}>
              {c.isPublic ? <Globe size={11} /> : <Lock size={11} />} {c.isPublic ? "Public" : "Private"}
            </span>
          </div>
          <p className="mt-1 text-xs text-lf-text-dim">
            {styleLabel(c.style)} · {formatDate(c.createdAt)} · {c.imageCount} {c.imageCount === 1 ? "image" : "images"}
          </p>
          {c.isPublic && (
            <p className="mt-1 flex items-center gap-3 text-xs text-lf-text-faint">
              <span className="inline-flex items-center gap-1"><Heart size={11} /> {c.likeCount}</span>
              <span className="inline-flex items-center gap-1"><Eye size={11} /> {c.viewCount}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {c.downloadUrl && (
            <a href={c.downloadUrl}>
              <Button variant="secondary" className="px-4 py-2"><Download size={14} /> Download</Button>
            </a>
          )}
          <Button variant="secondary" className="px-4 py-2" onClick={() => setSceneOpen((v) => !v)}>
            <Clapperboard size={14} /> Another scene
          </Button>
          <ShareButton characterId={c.id} name={c.name} isPublic={c.isPublic} onPublishRequest={() => setPublic(true)} />
        </div>

        {sceneOpen && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex gap-2">
              <input value={scenePrompt} onChange={(e) => setScenePrompt(e.target.value)} maxLength={2000}
                onKeyDown={(e) => e.key === "Enter" && generateScene()}
                placeholder='e.g. "driving a Lamborghini"'
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2.5 py-2 text-sm placeholder:text-lf-text-faint focus:border-lf-purple-light focus:outline-none" />
              <Button variant="primary" className="px-4 py-2" disabled={!scenePrompt.trim() || sceneBusy} onClick={generateScene}>
                {sceneBusy ? <Loader2 size={14} className="animate-spin" /> : "Go"}
              </Button>
            </div>
            {sceneBusy && <p className="text-xs text-lf-text-faint">Generating — this can take up to a minute…</p>}
            {latestScene && (
              <div className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={latestScene} alt="New scene" className="w-full rounded-md" />
                <p className="text-xs text-lf-cyan">
                  Added to this character.{" "}
                  <a href={latestScene} download={`${c.name}-scene.png`} className="underline">Download</a>{" · "}
                  <Link href={`/c/${c.id}`} className="underline">View all images</Link>
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1 border-t border-white/5 pt-3 text-xs">
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-lf-text-dim hover:bg-white/5 hover:text-lf-text cursor-pointer">
            <Pencil size={12} /> Edit
          </button>
          <button onClick={() => setPublic(!c.isPublic)} disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-lf-text-dim hover:bg-white/5 hover:text-lf-text disabled:opacity-50 cursor-pointer">
            {busy === "publish" ? <Loader2 size={12} className="animate-spin" /> : c.isPublic ? <Lock size={12} /> : <Globe size={12} />}
            {c.isPublic ? "Make private" : "Publish to Explore"}
          </button>
          <button onClick={remove} disabled={busy !== null}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-red-300/80 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50 cursor-pointer">
            {busy === "delete" ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {editing && (
        <EditCharacterDialog characterId={c.id} initialName={c.name} initialLore={c.lore}
          onClose={() => setEditing(false)} onSaved={() => { setEditing(false); router.refresh(); }} />
      )}
    </article>
  );
}
