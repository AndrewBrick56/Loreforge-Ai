import Link from "next/link";
import { Heart, Eye } from "lucide-react";
import { styleLabel } from "@/lib/format";
import type { ExploreCardDTO } from "@/lib/characters-data";

export function PublicCharacterCard({ character: c }: { character: ExploreCardDTO }) {
  return (
    <Link href={`/c/${c.id}`} className="lf-glass lf-glass-hover block overflow-hidden">
      {c.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.coverUrl} alt={c.name} loading="lazy" className="aspect-square w-full bg-black/40 object-cover" />
      ) : (
        <div className="grid aspect-square place-items-center bg-black/40 text-sm text-lf-text-faint">Image unavailable</div>
      )}
      <div className="space-y-1.5 p-4">
        <h3 className="font-display text-sm font-bold leading-tight">{c.name}</h3>
        {c.title && <p className="line-clamp-1 text-xs text-lf-text-dim">{c.title}</p>}
        <div className="flex items-center justify-between text-xs text-lf-text-faint">
          <span>by {c.creatorDisplayName}</span>
          <span className="rounded-full bg-white/5 px-2 py-0.5">{styleLabel(c.style)}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-lf-text-faint">
          <span className="inline-flex items-center gap-1"><Heart size={11} /> {c.likeCount}</span>
          <span className="inline-flex items-center gap-1"><Eye size={11} /> {c.viewCount}</span>
        </div>
      </div>
    </Link>
  );
}
