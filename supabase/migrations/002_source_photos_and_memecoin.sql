-- =====================================================================
-- LoreForge AI — migration 002: source photos + Memecoin Branding Studio
--
-- Additive on top of supabase/schema.sql. Run this AFTER schema.sql in the
-- Supabase SQL editor. Safe to re-run after a partial execution; existing
-- trigger and policy definitions are dropped before being recreated.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Store the user's original uploaded photo, separately from the
--    AI-generated character image.
--
-- character_images.kind gains new values. 'source' = the raw upload;
-- 'original' keeps meaning "first generated render" (unchanged, so
-- existing rows need no migration). New brand-asset kinds are added for
-- the Memecoin Branding Studio below.
-- ---------------------------------------------------------------------
alter table public.character_images drop constraint if exists character_images_kind_check;
alter table public.character_images
  add constraint character_images_kind_check
  check (kind in ('source', 'original', 'scene', 'logo', 'pfp', 'banner', 'sticker', 'meme'));

-- A source photo can be any dimensions a camera/phone produces, so it can't
-- be forced into our fixed aspect-ratio enum. Make the column nullable and
-- only require one of our supported ratios for generated kinds; a banner's
-- native ratio (3:1, e.g. Twitter/X's 1500x500) is added for the same
-- reason 9:16/16:9 already exist — real output needs to fit somewhere.
alter table public.character_images alter column aspect_ratio drop not null;
alter table public.character_images drop constraint if exists character_images_aspect_ratio_check;
alter table public.character_images
  add constraint character_images_aspect_ratio_check
  check (
    (kind = 'source' and aspect_ratio is null)
    or (kind <> 'source' and aspect_ratio is not null and aspect_ratio in ('1:1', '3:4', '4:3', '9:16', '16:9', '3:1'))
  );

-- Images can now be png, jpg, or webp (source photos and Telegram stickers). The
-- filename extension is stored explicitly and tied into the same
-- ids-derived-path check that already stops path forgery.
alter table public.character_images add column if not exists file_ext text not null default 'png';
alter table public.character_images drop constraint if exists character_images_file_ext_check;
alter table public.character_images add constraint character_images_file_ext_check check (file_ext in ('png', 'jpg', 'webp'));

alter table public.character_images drop constraint if exists storage_path_matches_ids;
alter table public.character_images
  add constraint storage_path_matches_ids
  check (storage_path = owner_id::text || '/' || character_id::text || '/' || id::text || '.' || file_ext);

-- A character may now have (at most) one stored source photo.
create unique index if not exists character_images_one_source_idx
  on public.character_images (character_id) where (kind = 'source');

-- Per-character image cap: brand assets (logos, pfps, banners, stickers,
-- memes) count against the same limit as scenes, so it's raised from 30 to
-- 60 to leave room for real branding work on top of scene generation.
create or replace function public.enforce_image_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.character_images where character_id = new.character_id) >= 60 then
    raise exception 'image_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- create_character gains an optional source-photo parameter. Re-created
-- (not altered) because Postgres can't add a parameter to an existing
-- function signature in place; the old 9-arg call site is replaced in the
-- app code, so no callers are left pointing at the previous signature.
drop function if exists public.create_character(uuid, uuid, text, public.art_style, text, text, text, text, jsonb);
drop function if exists public.create_character(uuid, uuid, text, public.art_style, text, text, text, text, jsonb, uuid, text);
drop function if exists public.create_character(uuid, uuid, text, public.art_style, text, text, text, text, jsonb, uuid, text, text);
create or replace function public.create_character(
  p_character_id     uuid,
  p_image_id         uuid,
  p_name             text,
  p_style            public.art_style,
  p_prompt           text,
  p_storage_path     text,
  p_aspect_ratio     text,
  p_model            text,
  p_profile          jsonb default null,
  p_source_image_id  uuid default null,
  p_source_path      text default null,
  p_source_file_ext  text default 'png'
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.characters (id, owner_id, name, style, prompt)
  values (p_character_id, auth.uid(), p_name, p_style, p_prompt);

  insert into public.character_images (id, character_id, owner_id, storage_path, kind, aspect_ratio, model, file_ext)
  values (p_image_id, p_character_id, auth.uid(), p_storage_path, 'original', p_aspect_ratio, p_model, 'png');

  update public.characters set cover_image_id = p_image_id where id = p_character_id;

  if p_source_image_id is not null and p_source_path is not null then
    if p_source_file_ext not in ('png', 'jpg', 'webp') then
      raise exception 'unsupported_source_image_extension' using errcode = '22023';
    end if;
    insert into public.character_images (id, character_id, owner_id, storage_path, kind, aspect_ratio, file_ext)
    values (p_source_image_id, p_character_id, auth.uid(), p_source_path, 'source', null, p_source_file_ext);
  end if;

  if p_profile is not null then
    insert into public.character_profiles (character_id, title, personality, catchphrase, origin_story, likes, dislikes)
    values (
      p_character_id,
      coalesce(p_profile->>'title', ''),
      coalesce(p_profile->>'personality', ''),
      coalesce(p_profile->>'catchphrase', ''),
      coalesce(p_profile->>'originStory', ''),
      coalesce(array(select jsonb_array_elements_text(p_profile->'likes')), '{}'),
      coalesce(array(select jsonb_array_elements_text(p_profile->'dislikes')), '{}')
    );
  end if;
end $$;

revoke execute on function public.create_character(uuid, uuid, text, public.art_style, text, text, text, text, jsonb, uuid, text, text) from public, anon;
grant execute on function public.create_character(uuid, uuid, text, public.art_style, text, text, text, text, jsonb, uuid, text, text) to authenticated;

-- The RPC and future brand-asset inserts need to set this explicitly
-- (webp for stickers), not just rely on its default.
grant insert (file_ext) on public.character_images to authenticated;

-- The storage bucket accepts all source-photo formats plus webp branding assets.
update storage.buckets set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'] where id = 'character-images';

-- ---------------------------------------------------------------------
-- 2. character_tokens — optional, informational association with an
--    EXISTING Solana SPL token. This is NOT proof of ownership: it's a
--    creator-declared link, shown with a clear "unverified" label unless
--    on-chain validation succeeded at save time. Wallet-signature-verified
--    ownership is a Stage 6 concern; this only validates that the mint
--    address is a real, correctly-formatted token that exists on-chain.
-- ---------------------------------------------------------------------
create table if not exists public.character_tokens (
  character_id      uuid primary key references public.characters (id) on delete cascade,
  mint_address      text not null check (mint_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  token_name        text check (char_length(token_name) <= 80),
  token_ticker      text check (char_length(token_ticker) <= 15),
  decimals          smallint,
  verified_on_chain boolean not null default false,
  associated_by     uuid not null references public.profiles (id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
DROP TRIGGER IF EXISTS character_tokens_updated_at ON public.character_tokens;
create trigger character_tokens_updated_at before update on public.character_tokens
  for each row execute function public.set_updated_at();

alter table public.character_tokens enable row level security;

DROP POLICY IF EXISTS character_tokens_select ON public.character_tokens;
create policy character_tokens_select on public.character_tokens for select to anon, authenticated
  using (exists (
    select 1 from public.characters c
    where c.id = character_id and (c.is_public or c.owner_id = auth.uid())
  ));
DROP POLICY IF EXISTS character_tokens_insert ON public.character_tokens;
create policy character_tokens_insert on public.character_tokens for insert to authenticated
  with check (
    associated_by = auth.uid()
    and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
  );
DROP POLICY IF EXISTS character_tokens_update ON public.character_tokens;
create policy character_tokens_update on public.character_tokens for update to authenticated
  using (exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid()));
DROP POLICY IF EXISTS character_tokens_delete ON public.character_tokens;
create policy character_tokens_delete on public.character_tokens for delete to authenticated
  using (exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid()));

revoke all on public.character_tokens from anon, authenticated;
grant select on public.character_tokens to anon, authenticated;
-- verified_on_chain is deliberately excluded from BOTH grants below. RLS
-- and grants are the real enforcement boundary — not our API route — since
-- Supabase exposes every table to PostgREST directly. Without this column
-- in the grant, Postgres rejects the *entire* insert/update statement if a
-- client's request tries to touch verified_on_chain (same behavior already
-- verified for characters.like_count/view_count). Only the server, using
-- the service-role client, can ever set this column, and it always does so
-- explicitly on every write (see /api/characters/[id]/token) rather than
-- relying on a stale prior value surviving an update.
grant insert (character_id, mint_address, token_name, token_ticker, decimals, associated_by)
  on public.character_tokens to authenticated;
grant update (mint_address, token_name, token_ticker, decimals) on public.character_tokens to authenticated;
grant delete on public.character_tokens to authenticated;
