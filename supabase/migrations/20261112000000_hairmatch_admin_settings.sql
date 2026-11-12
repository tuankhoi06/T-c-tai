-- Persist admin operational settings used by the backend workers.
create table if not exists public.hairmatch_admin_settings (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.hairmatch_admin_settings enable row level security;
revoke all on table public.hairmatch_admin_settings from public, anon, authenticated;
grant all on table public.hairmatch_admin_settings to service_role;
