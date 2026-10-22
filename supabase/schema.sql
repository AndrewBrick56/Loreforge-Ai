-- =====================================================================
-- LoreForge AI — database schema (Stage 5)
--
-- Run this file in the Supabase SQL editor (or via the CLI). Existing tables
-- and rows are preserved; trigger and policy definitions are replaced safely
-- on re-run. This is the baseline schema, not a migration system. For changes
-- to deployed projects, use proper migrations.
--
-- Security model in one paragraph:
--   * Every table has row-level security (RLS) enabled.
--   * Clients (anon / authenticated roles) get the *minimum* column-level
--     privileges needed. In particular nobody can write like_count,
--     view_count, or another user's rows.
--   * Anything that must not be client-controlled (view tracking,
--     generation history, Storage reads/writes, signed URLs) is done by
--     the Next.js server using the service-role key, which bypasses RLS.
--   * The Storage bucket is PRIVATE. Images are only ever served through
--     short-lived signed URLs minted by the server after RLS has already
--     confirmed the requester may see the parent character.
-- =====================================================================

-- ---------- Types ----------------------------------------------------
do $$ begin
  create type public.art_style as enum (
    '3d_animation', 'cartoon', 'anime', 'cyberpunk', 'internet_meme',
    'comic_book', 'fantasy', 'clay_animation', 'video_game'
  );
exception when duplicate_object then null; end $$;

-- ---------- Helpers --------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profiles (the "users" table) -----------------------------
-- One row per auth.users row, created automatically by trigger below.
-- Only public-safe fields live here: it is readable by everyone so that
-- creator names can be shown on public characters. Never put an email
-- address or wallet secret in this table.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 50),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  base text;
  candidate text;
begin
  -- Derive a URL-safe username from the email prefix + random suffix.
  -- The suffix keeps it unique AND stops the email prefix from being
  -- published verbatim as the public display name.
  base := lower(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^a-zA-Z0-9]', '', 'g'));
  if char_length(base) < 3 then base := 'user'; end if;
  candidate := left(base, 12) || '_' || substr(md5(random()::text || new.id::text), 1, 8);
  insert into public.profiles (id, username, display_name)
  values (new.id, candidate, candidate);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- characters -----------------------------------------------
create table if not exists public.characters (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 80),
  style          public.art_style not null,
  prompt         text not null default '' check (char_length(prompt) <= 2000),
  is_public      boolean not null default false,
  cover_image_id uuid,
  like_count     integer not null default 0 check (like_count >= 0),
  view_count     integer not null default 0 check (view_count >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists characters_owner_idx on public.characters (owner_id, created_at desc);
create index if not exists characters_public_idx on public.characters (is_public, created_at desc) where is_public;
DROP TRIGGER IF EXISTS characters_updated_at ON public.characters;
create trigger characters_updated_at before update on public.characters
  for each row execute function public.set_updated_at();

-- ---------- character_images (the "generated images" table) ----------
create table if not exists public.character_images (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  kind         text not null check (kind in ('original', 'scene')),
  scene_prompt text check (char_length(scene_prompt) <= 2000),
  aspect_ratio text not null check (aspect_ratio in ('1:1', '3:4', '4:3', '9:16', '16:9')),
  model        text,
  created_at   timestamptz not null default now(),
  unique (id, character_id),
  -- The path is derived from the row's own ids. Combined with the RLS
  -- policy (owner_id = auth.uid()), this means a user can never create an
  -- image row that points at somebody else's file in Storage.
  constraint storage_path_matches_ids
    check (storage_path = owner_id::text || '/' || character_id::text || '/' || id::text || '.png')
);
create index if not exists character_images_character_idx on public.character_images (character_id, created_at);

-- Cover image must belong to the same character (composite FK). PG15+.
alter table public.characters drop constraint if exists characters_cover_fk;
alter table public.characters
  add constraint characters_cover_fk
  foreign key (cover_image_id, id)
  references public.character_images (id, character_id)
  on delete set null (cover_image_id);

-- ---------- character_profiles (lore / identity) ---------------------
-- The character's *name* lives on characters.name; this table holds the
-- optional lore. Lore is never required to create an image.
create table if not exists public.character_profiles (
  character_id uuid primary key references public.characters (id) on delete cascade,
  title        text not null default '' check (char_length(title) <= 120),
  personality  text not null default '' check (char_length(personality) <= 600),
  catchphrase  text not null default '' check (char_length(catchphrase) <= 200),
  origin_story text not null default '' check (char_length(origin_story) <= 1500),
  likes        text[] not null default '{}' check (cardinality(likes) <= 8),
  dislikes     text[] not null default '{}' check (cardinality(dislikes) <= 8),
  updated_at   timestamptz not null default now()
);
DROP TRIGGER IF EXISTS character_profiles_updated_at ON public.character_profiles;
create trigger character_profiles_updated_at before update on public.character_profiles
  for each row execute function public.set_updated_at();

-- ---------- likes ----------------------------------------------------
create table if not exists public.likes (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, character_id)
);
create index if not exists likes_character_idx on public.likes (character_id);

create or replace function public.sync_like_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.characters set like_count = like_count + 1 where id = new.character_id;
  elsif tg_op = 'DELETE' then
    update public.characters set like_count = greatest(like_count - 1, 0) where id = old.character_id;
  end if;
  return null;
end $$;
DROP TRIGGER IF EXISTS likes_sync_count ON public.likes;
create trigger likes_sync_count after insert or delete on public.likes
  for each row execute function public.sync_like_count();

-- ---------- views ----------------------------------------------------
-- One row per (character, viewer, UTC day). The unique constraint is what
-- stops a single visitor refreshing to inflate the counter. Written only
-- by the server (service role); no client policies exist.
create table if not exists public.views (
  id           bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  viewer_key   text not null,
  view_date    date not null default ((now() at time zone 'utc')::date),
  created_at   timestamptz not null default now(),
  unique (character_id, viewer_key, view_date)
);

create or replace function public.sync_view_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.characters set view_count = view_count + 1 where id = new.character_id;
  return null;
end $$;
DROP TRIGGER IF EXISTS views_sync_count ON public.views;
create trigger views_sync_count after insert on public.views
  for each row execute function public.sync_view_count();

-- ---------- generation_history --------------------------------------
-- Records generation outcomes for operational monitoring and debugging.
-- Rate-limit enforcement uses rate_limit_events and reserve_rate_limit below.
-- Written only by the server.
create table if not exists public.generation_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  mode         text not null check (mode in ('new_character', 'new_scene')),
  style        text,
  prompt       text check (char_length(prompt) <= 500),
  model        text,
  status       text not null check (status in ('success', 'error')),
  error_code   text,
  created_at   timestamptz not null default now()
);
create index if not exists generation_history_user_idx on public.generation_history (user_id, created_at desc);

-- ---------- shared rate-limit reservations ---------------------------
-- This table is server-only. The RPC below atomically reserves one slot for
-- a hashed key, avoiding process-local limits that reset across instances.
create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  key_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_events_key_created_idx
  on public.rate_limit_events (key_hash, created_at desc);
alter table public.rate_limit_events enable row level security;

create or replace function public.reserve_rate_limit(
  p_key_hash text,
  p_max_requests integer,
  p_window_seconds integer
) returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_window_start timestamptz;
  v_count integer;
  v_oldest timestamptz;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_rate_limit_key' using errcode = '22023';
  end if;
  if p_max_requests is null or p_max_requests < 1 or p_max_requests > 1000 then
    raise exception 'invalid_rate_limit_max' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid_rate_limit_window' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key_hash, 0));
  v_now := pg_catalog.clock_timestamp();
  v_window_start := v_now - pg_catalog.make_interval(secs => p_window_seconds);

  delete from public.rate_limit_events e
  where e.key_hash = p_key_hash and e.created_at <= v_window_start;

  select count(*)::integer, min(e.created_at)
    into v_count, v_oldest
  from public.rate_limit_events e
  where e.key_hash = p_key_hash and e.created_at > v_window_start;

  if v_count >= p_max_requests then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_oldest + pg_catalog.make_interval(secs => p_window_seconds) - v_now)))::integer);
    return;
  end if;

  insert into public.rate_limit_events (key_hash, created_at) values (p_key_hash, v_now);
  return query select true, 0;
end;
$$;

-- ---------- abuse limits --------------------------------------------
create or replace function public.enforce_character_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.characters where owner_id = new.owner_id) >= 100 then
    raise exception 'character_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end $$;
DROP TRIGGER IF EXISTS characters_limit ON public.characters;
create trigger characters_limit before insert on public.characters
  for each row execute function public.enforce_character_limit();

create or replace function public.enforce_image_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.character_images where character_id = new.character_id) >= 30 then
    raise exception 'image_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end $$;
DROP TRIGGER IF EXISTS character_images_limit ON public.character_images;
create trigger character_images_limit before insert on public.character_images
  for each row execute function public.enforce_image_limit();

-- ---------- atomic "save character" RPC ------------------------------
-- SECURITY INVOKER: it runs with the caller's privileges, so every RLS
-- policy and column grant below still applies. It exists only so that the
-- character, its first image and its lore are created all-or-nothing.
create or replace function public.create_character(
  p_character_id uuid,
  p_image_id     uuid,
  p_name         text,
  p_style        public.art_style,
  p_prompt       text,
  p_storage_path text,
  p_aspect_ratio text,
  p_model        text,
  p_profile      jsonb default null
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.characters (id, owner_id, name, style, prompt)
  values (p_character_id, auth.uid(), p_name, p_style, p_prompt);

  insert into public.character_images (id, character_id, owner_id, storage_path, kind, aspect_ratio, model)
  values (p_image_id, p_character_id, auth.uid(), p_storage_path, 'original', p_aspect_ratio, p_model);

  update public.characters set cover_image_id = p_image_id where id = p_character_id;

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

-- ---------- explore view --------------------------------------------
-- security_invoker => the caller's RLS applies to the underlying tables,
-- and the WHERE clause limits it to characters their owners chose to
-- publish. trending_score is engagement (likes weighted 3x views) divided
-- by an age penalty, so newer popular characters outrank stale ones.
create or replace view public.explore_characters
with (security_invoker = true) as
select
  c.id,
  c.name,
  c.style,
  c.created_at,
  c.like_count,
  c.view_count,
  i.storage_path as cover_path,
  p.username     as creator_username,
  p.display_name as creator_display_name,
  cp.title,
  cp.catchphrase,
  ((c.like_count * 3 + c.view_count + 1)::float8
    / power(extract(epoch from (now() - c.created_at)) / 3600.0 + 2, 1.5)) as trending_score
from public.characters c
join public.profiles p on p.id = c.owner_id
left join public.character_images i on i.id = c.cover_image_id
left join public.character_profiles cp on cp.character_id = c.id
where c.is_public;

-- =====================================================================
-- Row-level security
-- =====================================================================
alter table public.profiles           enable row level security;
alter table public.characters         enable row level security;
alter table public.character_images   enable row level security;
alter table public.character_profiles enable row level security;
alter table public.likes              enable row level security;
alter table public.views              enable row level security;
alter table public.generation_history enable row level security;

-- profiles: public read (safe fields only), owner-only update
DROP POLICY IF EXISTS profiles_select ON public.profiles;
create policy profiles_select on public.profiles for select to anon, authenticated using (true);
DROP POLICY IF EXISTS profiles_update ON public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- characters: readable if public or yours; only you can create/change/delete yours
DROP POLICY IF EXISTS characters_select ON public.characters;
create policy characters_select on public.characters for select to anon, authenticated
  using (is_public or owner_id = auth.uid());
DROP POLICY IF EXISTS characters_insert ON public.characters;
create policy characters_insert on public.characters for insert to authenticated
  with check (owner_id = auth.uid());
DROP POLICY IF EXISTS characters_update ON public.characters;
create policy characters_update on public.characters for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
DROP POLICY IF EXISTS characters_delete ON public.characters;
create policy characters_delete on public.characters for delete to authenticated
  using (owner_id = auth.uid());

-- images: visible when the parent character is visible
DROP POLICY IF EXISTS character_images_select ON public.character_images;
create policy character_images_select on public.character_images for select to anon, authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.characters c where c.id = character_id and c.is_public)
  );
DROP POLICY IF EXISTS character_images_insert ON public.character_images;
create policy character_images_insert on public.character_images for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
  );
DROP POLICY IF EXISTS character_images_delete ON public.character_images;
create policy character_images_delete on public.character_images for delete to authenticated
  using (owner_id = auth.uid());

-- lore: follows the parent character
DROP POLICY IF EXISTS character_profiles_select ON public.character_profiles;
create policy character_profiles_select on public.character_profiles for select to anon, authenticated
  using (exists (
    select 1 from public.characters c
    where c.id = character_id and (c.is_public or c.owner_id = auth.uid())
  ));
DROP POLICY IF EXISTS character_profiles_insert ON public.character_profiles;
create policy character_profiles_insert on public.character_profiles for insert to authenticated
  with check (exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid()));
DROP POLICY IF EXISTS character_profiles_update ON public.character_profiles;
create policy character_profiles_update on public.character_profiles for update to authenticated
  using (exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid()));

-- likes: you can see, add and remove only your own; you can only like
-- characters that are public or your own
DROP POLICY IF EXISTS likes_select ON public.likes;
create policy likes_select on public.likes for select to authenticated using (user_id = auth.uid());
DROP POLICY IF EXISTS likes_insert ON public.likes;
create policy likes_insert on public.likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.characters c
      where c.id = character_id and (c.is_public or c.owner_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS likes_delete ON public.likes;
create policy likes_delete on public.likes for delete to authenticated using (user_id = auth.uid());

-- views + generation_history: RLS on, deliberately NO policies. Only the
-- service role (server) can touch them.

-- =====================================================================
-- Privileges (least privilege, column level)
-- Supabase grants broad default privileges to anon/authenticated. Take
-- them all away, then grant back only what the app needs.
-- =====================================================================
revoke all on public.profiles, public.characters, public.character_images,
  public.character_profiles, public.likes, public.views, public.generation_history,
  public.rate_limit_events, public.explore_characters
  from anon, authenticated;

grant select on public.profiles, public.characters, public.character_images,
  public.character_profiles, public.explore_characters to anon, authenticated;
grant select on public.likes to authenticated;

revoke all on public.rate_limit_events from public, anon, authenticated;
grant select, insert, delete on public.rate_limit_events to service_role;
grant usage, select on sequence public.rate_limit_events_id_seq to service_role;
revoke execute on function public.reserve_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_rate_limit(text, integer, integer) to service_role;

grant update (username, display_name) on public.profiles to authenticated;

grant insert (id, owner_id, name, style, prompt) on public.characters to authenticated;
grant update (name, is_public, cover_image_id) on public.characters to authenticated;
grant delete on public.characters to authenticated;

grant insert (id, character_id, owner_id, storage_path, kind, scene_prompt, aspect_ratio, model)
  on public.character_images to authenticated;
grant delete on public.character_images to authenticated;

grant insert, update on public.character_profiles to authenticated;
grant insert, delete on public.likes to authenticated;

revoke execute on function public.create_character(uuid, uuid, text, public.art_style, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.create_character(uuid, uuid, text, public.art_style, text, text, text, text, jsonb)
  to authenticated;

revoke execute on function public.handle_new_user(), public.sync_like_count(),
  public.sync_view_count(), public.enforce_character_limit(), public.enforce_image_limit()
  from public, anon, authenticated;

-- =====================================================================
-- Storage: one PRIVATE bucket. No storage.objects policies are created on
-- purpose: with RLS on and no policies, browsers cannot list, read or
-- write objects directly. The server (service role) does all Storage I/O.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('character-images', 'character-images', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
