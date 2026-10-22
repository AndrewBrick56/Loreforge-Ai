-- =====================================================================
-- LoreForge AI — migration 003: atomic shared rate limits + source image fixes
-- Run after schema.sql and migration 002. Safe to re-run.
-- =====================================================================

-- Source-photo uploads preserve their actual file format. Earlier versions
-- accepted jpg paths in the API but constrained file_ext to png/webp and
-- hard-coded the RPC's source image extension to png.
alter table public.character_images drop constraint if exists character_images_file_ext_check;
alter table public.character_images
  add constraint character_images_file_ext_check check (file_ext in ('png', 'jpg', 'webp'));

-- The source-photo save route passes p_source_file_ext. Replace the older
-- 11-argument RPC so the deployed schema matches the application code.
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

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'character-images';

-- Durable retry queue for Storage objects that outlive a failed delete.
-- A cron worker checks that each path is no longer referenced before removal.
create table if not exists public.storage_cleanup_jobs (
  storage_path text primary key,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists storage_cleanup_jobs_created_idx
  on public.storage_cleanup_jobs (created_at asc);
alter table public.storage_cleanup_jobs enable row level security;
revoke all on public.storage_cleanup_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.storage_cleanup_jobs to service_role;

-- Shared rate-limit event log. Only the server service role may access it.
create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  key_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_events_key_created_idx
  on public.rate_limit_events (key_hash, created_at desc);
alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from public, anon, authenticated;
grant select, insert, delete on public.rate_limit_events to service_role;
grant usage, select on sequence public.rate_limit_events_id_seq to service_role;

-- Each key is serialized with an advisory transaction lock before counting
-- and reserving a slot, making the limit atomic across concurrent requests
-- and serverless instances. The caller passes only an HMAC of the raw key.
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
  v_now timestamptz := clock_timestamp();
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
  v_window_start := v_now - make_interval(secs => p_window_seconds);

  delete from public.rate_limit_events e
  where e.key_hash = p_key_hash and e.created_at <= v_window_start;

  select count(*)::integer, min(e.created_at)
    into v_count, v_oldest
  from public.rate_limit_events e
  where e.key_hash = p_key_hash and e.created_at > v_window_start;

  if v_count >= p_max_requests then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => p_window_seconds) - v_now)))::integer);
    return;
  end if;

  insert into public.rate_limit_events (key_hash, created_at) values (p_key_hash, v_now);
  return query select true, 0;
end;
$$;

revoke execute on function public.reserve_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_rate_limit(text, integer, integer) to service_role;
