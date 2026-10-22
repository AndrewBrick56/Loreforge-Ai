"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareButton({ characterId, name, isPublic, onPublishRequest }: {
  characterId: string; name: string; isPublic: boolean; onPublishRequest?: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "needs-public" | "error">("idle");

  async function share() {
    if (!isPublic) {
      setStatus("needs-public");
      return;
    }
    const url = `${window.location.origin}/c/${characterId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${name} — LoreForge AI`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setStatus("copied");
        setTimeout(() => setStatus("idle"), 2000);
      }
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") setStatus("error"); // AbortError = user closed the share sheet
    }
  }

  return (
    <div>
      <Button variant="secondary" className="px-4 py-2" onClick={share}>
        {status === "copied" ? <Check size={14} /> : <Share2 size={14} />}
        {status === "copied" ? "Link copied" : "Share"}
      </Button>
      {status === "needs-public" && (
        <p className="mt-2 text-xs text-lf-text-dim">
          Only public characters can be shared.{" "}
          {onPublishRequest && (
            <button onClick={onPublishRequest} className="text-lf-purple-light underline cursor-pointer">Publish it now</button>
          )}
        </p>
      )}
      {status === "error" && <p className="mt-2 text-xs text-red-400">Couldn&apos;t share. Copy the address from your browser instead.</p>}
    </div>
  );
}
