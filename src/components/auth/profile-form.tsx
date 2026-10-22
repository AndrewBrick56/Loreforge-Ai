"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProfileForm({ initialUsername, initialDisplayName }: { initialUsername: string; initialDisplayName: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(initialUsername);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ ok: false, text: data.error ?? "Couldn't save your profile." });
      else {
        setMsg({ ok: true, text: "Profile saved." });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the server." });
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm focus:border-lf-purple-light focus:outline-none";
  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label htmlFor="displayName" className="mb-1.5 block text-xs text-lf-text-dim">Display name</label>
        <input id="displayName" className={input} value={displayName} maxLength={50} required onChange={(e) => setDisplayName(e.target.value)} />
        <p className="mt-1 text-xs text-lf-text-faint">Shown publicly on characters you publish.</p>
      </div>
      <div>
        <label htmlFor="username" className="mb-1.5 block text-xs text-lf-text-dim">Username</label>
        <input id="username" className={input} value={username} maxLength={24} required pattern="[A-Za-z0-9_]{3,24}"
          onChange={(e) => setUsername(e.target.value.toLowerCase())} />
        <p className="mt-1 text-xs text-lf-text-faint">3–24 letters, numbers or underscores. Your public page is /u/{username || "…"}</p>
      </div>
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-lf-cyan/10 text-lf-cyan" : "bg-red-500/10 text-red-300"}`}>{msg.text}</p>}
      <Button type="submit" variant="primary" disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" />} Save profile</Button>
    </form>
  );
}
