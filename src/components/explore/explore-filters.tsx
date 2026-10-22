"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { ART_STYLES } from "@/types/character";
import { cn } from "@/lib/utils";

const SORTS = [
  { value: "trending", label: "Trending" },
  { value: "newest", label: "Newest" },
  { value: "liked", label: "Most liked" },
] as const;

export function ExploreFilters({ sort, style, q, showSearch = true }: { sort: string; style: string; q: string; showSearch?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(q);

  function apply(next: { sort?: string; style?: string; q?: string }) {
    const params = new URLSearchParams();
    const s = next.sort ?? sort;
    const st = next.style ?? style;
    const query = next.q ?? q;
    if (s !== "trending") params.set("sort", s);
    if (st) params.set("style", st);
    if (query.trim()) params.set("q", query.trim());
    startTransition(() => router.replace(params.size ? `${pathname}?${params}` : pathname));
  }

  return (
    <div className={cn("space-y-4 transition-opacity", pending && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full bg-black/30 p-1 text-sm" role="tablist" aria-label="Sort characters">
          {SORTS.map((s) => (
            <button key={s.value} role="tab" aria-selected={sort === s.value} onClick={() => apply({ sort: s.value })}
              className={cn("rounded-full px-4 py-1.5 font-medium transition-colors cursor-pointer",
                sort === s.value ? "bg-lf-purple/30 text-white" : "text-lf-text-dim hover:text-lf-text")}>
              {s.label}
            </button>
          ))}
        </div>

        <select value={style} onChange={(e) => apply({ style: e.target.value })} aria-label="Filter by art style"
          className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-lf-text-dim focus:border-lf-purple-light focus:outline-none">
          <option value="">All styles</option>
          {ART_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        {showSearch && (
          <form className="relative min-w-[200px] flex-1 sm:max-w-xs" onSubmit={(e) => { e.preventDefault(); apply({ q: text }); }}>
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lf-text-faint" />
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={60} placeholder="Search characters…"
              aria-label="Search characters"
              className="w-full rounded-full border border-white/10 bg-black/30 py-2 pl-9 pr-4 text-sm placeholder:text-lf-text-faint focus:border-lf-purple-light focus:outline-none" />
          </form>
        )}
      </div>
    </div>
  );
}
