-- Adds the mobile number collected on the quiz join form.
-- Safe to run more than once.

alter table if exists public.students
  add column if not exists mobile_number text;
