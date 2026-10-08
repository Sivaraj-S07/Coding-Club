-- Migration for existing databases.
-- Safe to run more than once.
--
-- 1) Round qualification gate: minimum % of a round a student must answer
--    correctly to move on to the next round (0 = no gate).
-- 2) Persistent admin notification read state, so the red unread dot
--    disappears once a notification has been read and never comes back.

alter table if exists public.rounds
  add column if not exists qualification_percentage numeric not null default 0;

-- 3) Some early databases created `rounds` without `updated_at`; editing a
--    round writes this column, so make sure it exists.
alter table if exists public.rounds
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.admin_notification_reads (
  id uuid primary key default gen_random_uuid(),
  admin_key text not null default 'admin',
  notification_id text not null,
  read_at timestamptz not null default now(),
  unique (admin_key, notification_id)
);

create index if not exists admin_notification_reads_admin_idx
  on public.admin_notification_reads (admin_key);

alter table public.admin_notification_reads enable row level security;
