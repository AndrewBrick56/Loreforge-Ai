create table if not exists public.launchpad_clicks (
  id uuid primary key default gen_random_uuid(),

  launchpad_id text not null
    check (launchpad_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),

  user_id uuid references auth.users(id) on delete set null,

  source text not null default 'directory'
    check (source in ('directory', 'launch_kit')),

  clicked_at timestamptz not null default now()
);

create index if not exists launchpad_clicks_destination_time_idx
  on public.launchpad_clicks (launchpad_id, clicked_at desc);

create index if not exists launchpad_clicks_user_time_idx
  on public.launchpad_clicks (user_id, clicked_at desc)
  where user_id is not null;

alter table public.launchpad_clicks enable row level security;

revoke all on public.launchpad_clicks
  from public, anon, authenticated;

grant select, insert on public.launchpad_clicks to service_role;