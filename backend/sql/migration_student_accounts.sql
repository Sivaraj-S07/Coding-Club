-- ============================================================================
-- Student self-service accounts (Sign Up / Sign In -> Dashboard)
--
-- Run this in the Supabase SQL Editor if your database was created before
-- this feature was added (it is also already included, inline, at the
-- bottom of schema.sql — so brand-new databases don't need this file).
--
-- SAFE TO RE-RUN. Every statement is idempotent. No existing table, column
-- or row is dropped or modified — this only ADDS two nullable columns to
-- `students` plus a couple of constraints/indexes. Existing quizzes,
-- students, attempts, results, attendance, everything, is left untouched.
-- ============================================================================

alter table students add column if not exists username text;
alter table students add column if not exists password_hash text;
alter table students add column if not exists account_created_at timestamptz;

drop index if exists idx_students_username_unique;
create unique index idx_students_username_unique on students (lower(username)) where username is not null;

alter table students drop constraint if exists students_register_number_format;
alter table students add constraint students_register_number_format
  check (register_number ~ '^[0-9]{12}$');
