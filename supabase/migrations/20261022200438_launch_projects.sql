-- Saved LoreForge memecoin projects
create table if not exists public.launch_projects (
  id uuid primary key default gen_random_uuid(),

  owner_id uuid not null
    references auth.users(id) on delete cascade,

  character_id uuid not null
    references public.characters(id) on delete cascade,

  project_name text not null
    check (char_length(trim(project_name)) between 1 and 80),

  ticker text not null
    check (ticker ~ '^[A-Z0-9]{3,6}$'),

  tagline text not null default '',
  description text not null default '',
  x_post text not null default '',
  telegram_welcome text not null default '',

  selected_launchpad_id text
    check (
      selected_launchpad_id is null
      or selected_launchpad_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'
    ),

  status text not null default 'draft'
    check (status in ('draft', 'prepared', 'handed_off', 'launched')),

  -- Only populated after a launched token has actually been verified.
  token_mint_address text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists launch_projects_owner_updated_idx
  on public.launch_projects (owner_id, updated_at desc);

create index if not exists launch_projects_character_idx
  on public.launch_projects (character_id);

alter table public.launch_projects enable row level security;

grant select, insert, update, delete
  on public.launch_projects to authenticated;

drop policy if exists launch_projects_select_own
  on public.launch_projects;

create policy launch_projects_select_own
  on public.launch_projects
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists launch_projects_insert_own
  on public.launch_projects;

create policy launch_projects_insert_own
  on public.launch_projects
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.characters c
      where c.id = character_id
        and c.owner_id = (select auth.uid())
    )
  );

drop policy if exists launch_projects_update_own
  on public.launch_projects;

create policy launch_projects_update_own
  on public.launch_projects
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.characters c
      where c.id = character_id
        and c.owner_id = (select auth.uid())
    )
  );

drop policy if exists launch_projects_delete_own
  on public.launch_projects;

create policy launch_projects_delete_own
  on public.launch_projects
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Associate future handoff events with a saved project.
alter table public.launchpad_clicks
  add column if not exists project_id uuid
  references public.launch_projects(id) on delete set null;

create index if not exists launchpad_clicks_project_time_idx
  on public.launchpad_clicks (project_id, clicked_at desc)
  where project_id is not null;