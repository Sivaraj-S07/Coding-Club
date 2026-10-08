-- ============================================================================
-- Landing Page Media (Admin -> Landing Media)
--
-- Run this in the Supabase SQL Editor if your database was created before
-- this feature was added (it is also already included, inline, at the
-- bottom of schema.sql — so brand-new databases don't need this file).
--
-- WHAT THIS DOES
-- Adds a `landing_media` table so an admin can upload images/videos (via
-- Admin -> Landing Media) that appear in a gallery section on the public
-- Landing Page. The actual files live in Supabase Storage (bucket
-- `landing-media`, created automatically by the backend on first upload) —
-- this table only stores the metadata + public URL for each item.
--
-- SAFE TO RE-RUN. Every statement is idempotent. No existing table, column
-- or row is dropped or modified.
-- ============================================================================

create table if not exists landing_media (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('image', 'video')),
  title text,
  caption text,
  storage_path text not null,
  url text not null,
  mime_type text,
  file_size_bytes bigint,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_landing_media_active_order
  on landing_media (is_active, sort_order);

alter table landing_media enable row level security;
-- Same policy stance as every other table in this schema (see the note near
-- the bottom of schema.sql): the Express API is the only thing that talks to
-- Supabase and always uses the service-role key, which bypasses RLS. No
-- anon/authenticated policies are added, so a leaked anon key still can't
-- read or write this table directly.
