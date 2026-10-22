"use client";

import Link from "next/link";
import { Loader2, Download, RefreshCw, BookmarkPlus, AlertTriangle, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export type GenerationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "success";
      /** For display (<img src>). May be a signed Storage URL or a data: URL, depending on whether Storage is configured. */
      imageUrl: string;
      /** For the Download button — forces a real download (Content-Disposition) even when imageUrl is cross-origin. Falls back to imageUrl if absent. */
      downloadUrl?: string;
      /** Present only when the image lives in Storage as an unsaved draft; required alongside imageToken to save it. */
      pendingImagePath?: string | null;
      /** Proves the server generated these exact bytes; required to save them. */
      imageToken?: string | null;
    };

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; characterId: string }
  | { status: "error"; message: string; needsAuth?: boolean };

interface GenerationResultPanelProps {
  state: GenerationState;
  saveState: SaveState;
  onRetry: () => void;
  onSaveToCollection: () => void;
}

export function GenerationResultPanel({ state, saveState, onRetry, onSaveToCollection }: GenerationResultPanelProps) {
  if (state.status === "idle") {
    return (
      <div className="grid aspect-square place-items-center rounded-xl border border-white/10 bg-white/[0.02] text-center">
        <div className="px-6 text-lf-text-faint">
          <Sparkles className="mx-auto mb-3" size={28} />
          <p className="text-sm">Your generated character will appear here.</p>
        </div>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="grid aspect-square place-items-center rounded-xl border border-lf-purple-light/30 bg-lf-purple/5">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 animate-spin text-lf-purple-light" size={28} />
          <p className="text-sm text-lf-text-dim">Forging your character…</p>
          <p className="mt-1 text-xs text-lf-text-faint">This can take up to a minute.</p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-4 rounded-xl border border-red-500/30 bg-red-500/5 px-6 text-center">
        <AlertTriangle className="text-red-400" size={26} />
        <p className="text-sm text-red-200">{state.message}</p>
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw size={15} /> Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-lf-glass-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={state.imageUrl} alt="Generated character" className="w-full object-contain bg-black/40" />
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={state.downloadUrl ?? state.imageUrl} download="loreforge-character.png">
          <Button variant="secondary">
            <Download size={15} /> Download
          </Button>
        </a>
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw size={15} /> Regenerate
        </Button>
        {saveState.status === "saved" ? (
          <Button variant="secondary" disabled>
            <Check size={15} /> Saved
          </Button>
        ) : (
          <Button variant="primary" onClick={onSaveToCollection} disabled={saveState.status === "saving"}>
            {saveState.status === "saving" ? <Loader2 size={15} className="animate-spin" /> : <BookmarkPlus size={15} />}
            {saveState.status === "saving" ? "Saving…" : "Save to collection"}
          </Button>
        )}
      </div>

      {saveState.status === "saved" && (
        <p className="text-sm text-lf-cyan">
          Saved to your collection.{" "}
          <Link href="/characters" className="underline hover:text-white">View My Characters</Link>
        </p>
      )}
      {saveState.status === "error" && (
        <p className="text-sm text-red-300">
          {saveState.message}
          {saveState.needsAuth && (
            <>
              {" "}
              {/* New tab on purpose: signing in must not throw away the image you just paid to generate. */}
              <Link href="/login?next=/create" target="_blank" className="underline hover:text-white">
                Sign in (opens in a new tab)
              </Link>
              , then press Save again.
            </>
          )}
        </p>
      )}
    </div>
  );
}
