-- HairMatch application storage.
-- The API uses a server-only Supabase key; client roles must not access these rows.

create table if not exists public.hairmatch_users (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

create unique index if not exists hairmatch_users_email_unique
  on public.hairmatch_users (lower(payload ->> 'email'))
  where nullif(payload ->> 'email', '') is not null;
create unique index if not exists hairmatch_users_phone_unique
  on public.hairmatch_users ((payload ->> 'phone'))
  where nullif(payload ->> 'phone', '') is not null;

create table if not exists public.hairmatch_services (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

create table if not exists public.hairmatch_barbers (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

create table if not exists public.hairmatch_schedules (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);
create index if not exists hairmatch_schedules_barber_date_idx
  on public.hairmatch_schedules ((payload ->> 'barberId'), (payload ->> 'date'));

create table if not exists public.hairmatch_appointments (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);
create index if not exists hairmatch_appointments_customer_idx
  on public.hairmatch_appointments ((payload ->> 'customerId'));
create index if not exists hairmatch_appointments_barber_start_idx
  on public.hairmatch_appointments ((payload ->> 'barberId'), (payload ->> 'startAt'));
create index if not exists hairmatch_appointments_status_idx
  on public.hairmatch_appointments ((payload ->> 'status'));

create table if not exists public.hairmatch_blocks (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

create table if not exists public.hairmatch_leaves (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

create table if not exists public.hairmatch_weekly_shifts (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

create table if not exists public.hairmatch_vouchers (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);
create unique index if not exists hairmatch_vouchers_code_unique
  on public.hairmatch_vouchers (upper(payload ->> 'code'));

create table if not exists public.hairmatch_notifications (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);
create index if not exists hairmatch_notifications_customer_idx
  on public.hairmatch_notifications ((payload ->> 'customerId'));

create table if not exists public.hairmatch_push_devices (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

create table if not exists public.hairmatch_support_messages (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);
create index if not exists hairmatch_support_messages_customer_idx
  on public.hairmatch_support_messages ((payload ->> 'customerId'));

-- Sessions remain in memory so bearer tokens are not stored in the database.
-- The backend's secret key is the only role granted access to application rows.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'hairmatch_users',
    'hairmatch_services',
    'hairmatch_barbers',
    'hairmatch_schedules',
    'hairmatch_appointments',
    'hairmatch_blocks',
    'hairmatch_leaves',
    'hairmatch_weekly_shifts',
    'hairmatch_vouchers',
    'hairmatch_notifications',
    'hairmatch_push_devices',
    'hairmatch_support_messages'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end;
$$;
