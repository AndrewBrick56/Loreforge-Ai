import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Eye, Globe, Lock, ImageIcon } from "lucide-react";
import { getServerUser, UUID_RE } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCharacterDetail } from "@/lib/characters-data";
import { formatDate, styleLabel } from "@/lib/format";
import { LikeButton } from "@/components/characters/like-button";
import { ViewTracker } from "@/components/characters/view-tracker";
import { ShareButton } from "@/components/characters/share-button";
import { BrandStudio } from "@/components/characters/brand-studio";
import { TokenPanel } from "@/components/characters/token-panel";
import { SetupNotice } from "@/components/ui/setup-notice";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";

const ASSET_LABELS: Record<string, string> = { logo: "Logo", pfp: "X profile picture", banner: "X banner", sticker: "Telegram sticker", meme: "Reaction meme" };

export const metadata: Metadata = { title: "Character — LoreForge AI" };

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  if (!isSupabaseConfigured()) {
    return <div className="mx-auto max-w-2xl px-4 py-16"><SetupNotice what="Character pages" /></div>;
  }

  const { supabase, user } = await getServerUser();
  if (!supabase) notFound();
  // null covers both "doesn't exist" and "private and not yours" — deliberately indistinguishable.
  const c = await getCharacterDetail(supabase, id, user?.id ?? null);
  if (!c) notFound();

  const [cover, ...more] = c.images;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      {c.isPublic && !c.isOwner && <ViewTracker characterId={c.id} />}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {cover?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.url} alt={c.name} className="w-full rounded-xl border border-lf-glass-border bg-black/40" />
          ) : (
            <div className="grid aspect-square place-items-center rounded-xl border border-white/10 bg-black/40 text-sm text-lf-text-faint">Image unavailable</div>
          )}

          {more.length > 0 && (
            <div>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-lf-text-faint">More scenes ({more.length})</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {more.map((img) => (
                  <figure key={img.id} className="space-y-1.5">
                    {img.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img.url} alt={img.scenePrompt ?? "Scene"} loading="lazy" className="w-full rounded-lg border border-white/10 bg-black/40" />
                    ) : (
                      <div className="aspect-square rounded-lg bg-black/40" />
                    )}
                    {img.scenePrompt && <figcaption className="line-clamp-2 text-xs text-lf-text-faint">{img.scenePrompt}</figcaption>}
                    {img.downloadUrl && <a href={img.downloadUrl} className="text-xs text-lf-purple-light hover:underline">Download</a>}
                  </figure>
                ))}
              </div>
            </div>
          )}

          {c.brandAssets.length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-lf-text-faint">
                <ImageIcon size={12} /> Brand assets ({c.brandAssets.length})
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {c.brandAssets.map((asset) => (
                  <figure key={asset.id} className="space-y-1.5">
                    {asset.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.url}
                        alt={ASSET_LABELS[asset.kind]}
                        loading="lazy"
                        className="w-full rounded-lg border border-white/10 bg-black/40"
                        style={asset.kind === "logo" || asset.kind === "sticker" ? { background: "repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 16px 16px" } : undefined}
                      />
                    ) : (
                      <div className="aspect-square rounded-lg bg-black/40" />
                    )}
                    <figcaption className="text-xs text-lf-text-faint">{ASSET_LABELS[asset.kind]}</figcaption>
                    {asset.downloadUrl && <a href={asset.downloadUrl} className="text-xs text-lf-purple-light hover:underline">Download</a>}
                  </figure>
                ))}
              </div>
            </div>
          )}

          {c.isOwner && c.sourcePhotoUrl && (
            <div>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-lf-text-faint">Your original photo (only visible to you)</h2>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.sourcePhotoUrl} alt="Your original upload" className="max-w-[160px] rounded-lg border border-white/10 bg-black/40" />
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-lf-text-faint">
              <span className="rounded-full bg-white/5 px-2.5 py-1">{styleLabel(c.style)}</span>
              <span>{formatDate(c.createdAt)}</span>
              {c.isOwner && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${c.isPublic ? "bg-lf-cyan/15 text-lf-cyan" : "bg-white/5"}`}>
                  {c.isPublic ? <Globe size={11} /> : <Lock size={11} />} {c.isPublic ? "Public" : "Only you can see this"}
                </span>
              )}
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold leading-tight">{c.name}</h1>
            {c.lore?.title && <p className="mt-1 text-lf-text-dim">{c.lore.title}</p>}
            <p className="mt-3 text-sm text-lf-text-dim">
              by{" "}
              <Link href={`/u/${c.creator.username}`} className="text-lf-purple-light hover:underline">{c.creator.displayName}</Link>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {c.isPublic ? (
              <LikeButton characterId={c.id} initialLiked={c.liked} initialCount={c.likeCount} signedIn={Boolean(user)} />
            ) : null}
            {c.isPublic && (
              <span className="inline-flex items-center gap-1.5 text-sm text-lf-text-dim"><Eye size={15} /> {c.viewCount} {c.viewCount === 1 ? "view" : "views"}</span>
            )}
            {cover?.downloadUrl && (
              <a href={cover.downloadUrl}><Button variant="secondary" className="px-4 py-2"><Download size={14} /> Download</Button></a>
            )}
            <ShareButton characterId={c.id} name={c.name} isPublic={c.isPublic} />
          </div>

          {c.lore && (c.lore.personality || c.lore.catchphrase || c.lore.originStory) && (
            <GlassCard hover={false} className="space-y-3">
              {c.lore.catchphrase && <p className="font-display text-lg italic text-lf-purple-light">&ldquo;{c.lore.catchphrase}&rdquo;</p>}
              {c.lore.personality && <p className="text-sm text-lf-text-dim">{c.lore.personality}</p>}
              {c.lore.originStory && (
                <div>
                  <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-lf-text-faint">Origin story</h2>
                  <p className="text-sm leading-relaxed text-lf-text-dim">{c.lore.originStory}</p>
                </div>
              )}
              {(c.lore.likes.length > 0 || c.lore.dislikes.length > 0) && (
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  {c.lore.likes.length > 0 && <div><h2 className="text-xs uppercase tracking-wide text-lf-text-faint">Likes</h2><p className="text-lf-text-dim">{c.lore.likes.join(", ")}</p></div>}
                  {c.lore.dislikes.length > 0 && <div><h2 className="text-xs uppercase tracking-wide text-lf-text-faint">Dislikes</h2><p className="text-lf-text-dim">{c.lore.dislikes.join(", ")}</p></div>}
                </div>
              )}
            </GlassCard>
          )}

          {c.isOwner && (
            <p className="text-sm text-lf-text-faint">
              This is your character.{" "}
              <Link href="/characters" className="text-lf-purple-light hover:underline">Manage it in My Characters</Link>.
            </p>
          )}

          <TokenPanel characterId={c.id} isOwner={c.isOwner} />

          {c.isOwner && <BrandStudio characterId={c.id} characterName={c.name} />}
        </div>
      </div>
    </div>
  );
}
