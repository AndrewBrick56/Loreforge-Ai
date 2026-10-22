"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Message = { kind: "error" | "info"; text: string } | null;

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(
    initialError ? { kind: "error", text: "That sign-in link didn't work or has expired. Please try again." } : null
  );

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo() },
        });
        if (error) {
          setMessage({ kind: "error", text: error.message });
        } else if (data.session) {
          router.push(next);
          router.refresh();
        } else {
          setMessage({ kind: "info", text: "Almost there — check your email for a confirmation link." });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          // Deliberately generic: don't reveal whether the email exists.
          setMessage({ kind: "error", text: "Incorrect email or password." });
        } else {
          router.push(next);
          router.refresh();
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleMagicLink() {
    if (!email) {
      setMessage({ kind: "error", text: "Enter your email first." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    setBusy(false);
    setMessage(
      error
        ? { kind: "error", text: error.message }
        : { kind: "info", text: "Check your email for a sign-in link." }
    );
  }

  const inputClass =
    "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm placeholder:text-lf-text-faint focus:border-lf-purple-light focus:outline-none";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1 text-sm">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setMessage(null);
            }}
            className={`rounded-md py-2 font-medium transition-colors cursor-pointer ${
              mode === m ? "bg-lf-purple/30 text-white" : "text-lf-text-dim hover:text-lf-text"
            }`}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs text-lf-text-dim">Email</label>
        <input id="email" type="email" required autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs text-lf-text-dim">Password</label>
        <input id="password" type="password" required minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password}
          onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="At least 8 characters" />
      </div>

      {message && (
        <p className={`rounded-lg px-3 py-2 text-sm ${
          message.kind === "error" ? "bg-red-500/10 text-red-300" : "bg-lf-cyan/10 text-lf-cyan"
        }`}>{message.text}</p>
      )}

      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy && <Loader2 size={15} className="animate-spin" />}
        {mode === "signin" ? "Sign in" : "Create account"}
      </Button>

      <button type="button" onClick={handleMagicLink} disabled={busy}
        className="flex w-full items-center justify-center gap-2 text-sm text-lf-text-dim hover:text-lf-text disabled:opacity-50 cursor-pointer">
        <Mail size={14} /> Email me a sign-in link instead
      </button>
    </form>
  );
}
