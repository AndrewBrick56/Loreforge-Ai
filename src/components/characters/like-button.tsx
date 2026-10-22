"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

export function LikeButton({
  characterId, initialLiked, initialCount, signedIn,
}: { characterId: string; initialLiked: boolean; initialCount: number; signedIn: boolean }) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(`/c/${characterId}`)}`);
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/like`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't update your like.");
        return;
      }
      setLiked(data.liked); // trust the server, not a guess
      setCount(data.likeCount);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={toggle}
        disabled={busy}
        aria-pressed={liked}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors cursor-pointer disabled:opacity-60",
          liked ? "border-lf-pink/60 bg-lf-pink/15 text-lf-pink" : "border-white/15 text-lf-text-dim hover:border-white/30 hover:text-lf-text"
        )}
      >
        <Heart size={16} fill={liked ? "currentColor" : "none"} />
        {count} {count === 1 ? "like" : "likes"}
      </button>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
