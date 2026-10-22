"use client";

import { useEffect, useRef } from "react";

/** Fires one view-count request when a public character page is opened. Renders nothing. */
export function ViewTracker({ characterId }: { characterId: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return; // guards React strict-mode double effects
    sent.current = true;
    fetch(`/api/characters/${characterId}/view`, { method: "POST", keepalive: true }).catch(() => {});
  }, [characterId]);
  return null;
}
