"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function AuthButton({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();

  // undefined = still checking; null = signed out
  // Avoid a state update in the effect when Supabase is not configured.
  const [email, setEmail] = useState<string | null | undefined>(() =>
    isSupabaseConfigured() ? undefined : null,
  );

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createClient();

    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Close the dropdown as soon as the user scrolls.
  useEffect(() => {
    if (!open) return;

    const closeOnScroll = () => setOpen(false);

    window.addEventListener("scroll", closeOnScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", closeOnScroll);
    };
  }, [open]);

  async function signOut() {
    await createClient().auth.signOut();
    setOpen(false);
    onNavigate?.();
    router.push("/");
    router.refresh();
  }

  if (email === undefined) {
    return <div className="h-9 w-20" aria-hidden />;
  }

  if (email === null) {
    return (
      <Link
        href="/login"
        onClick={onNavigate}
        className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-lf-text-dim transition-colors hover:border-white/30 hover:text-lf-text"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-sm text-lf-text-dim hover:border-white/30 hover:text-lf-text cursor-pointer"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <UserIcon size={15} /> Account <ChevronDown size={13} />
      </button>

      {open && (
        <div className="lf-glass fixed left-1/2 top-1/2 z-[80] w-[calc(100vw-2rem)] max-w-80 -translate-x-1/2 -translate-y-1/2 space-y-1 p-2 text-sm shadow-2xl md:absolute md:left-auto md:right-0 md:top-full md:mt-2 md:w-52 md:max-w-none md:translate-x-0 md:translate-y-0">
          <p className="truncate px-2 py-1 text-xs text-lf-text-faint">
            {email}
          </p>

          <Link
            href="/characters"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
            className="block rounded-md px-2 py-1.5 text-lf-text-dim hover:bg-white/5 hover:text-lf-text"
          >
            My characters
          </Link>

          <Link
            href="/account"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
            className="block rounded-md px-2 py-1.5 text-lf-text-dim hover:bg-white/5 hover:text-lf-text"
          >
            Profile settings
          </Link>

          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-lf-text-dim hover:bg-white/5 hover:text-lf-text cursor-pointer"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
