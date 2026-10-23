"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, Sparkles } from "lucide-react";
import { ConnectWalletButton } from "./connect-wallet-button";
import { AuthButton } from "./auth-button";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/create", label: "Create" },
  { href: "/explore", label: "Explore" },
  { href: "/launchpads", label: "Launchpads" },
  { href: "/characters", label: "My Characters" },
  { href: "/tokens", label: "Tokens" },
  { href: "/#how-it-works", label: "How It Works" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 lf-glass">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-lg font-bold tracking-wide"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-lf-purple to-lf-cyan text-white">
            <Sparkles size={16} />
          </span>
          <span className="lf-gradient-text">LoreForge AI</span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm text-lf-text-dim">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-lf-text"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <AuthButton />
          <ConnectWalletButton />
        </div>

        <button
          className="md:hidden text-lf-text"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-white/5 px-4 pb-4 pt-2">
          <nav className="flex flex-col gap-3 text-sm text-lf-text-dim">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="py-1 transition-colors hover:text-lf-text"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <AuthButton onNavigate={() => setOpen(false)} />
            <ConnectWalletButton />
          </div>
        </div>
      )}
    </header>
  );
}
