-- ============================================================================
-- Landing Page Quizzes
--
-- Run this in the Supabase SQL Editor if your database was created before
-- this feature was added (it is also already included, inline, at the
-- bottom of schema.sql — so brand-new databases don't need this file).
--
-- WHAT THIS DOES
-- Adds a `placement` column to `quizzes` so a quiz can be shown either on
-- the normal Quizzes tab ('quizzes', the default — every existing row gets
-- this value automatically, so nothing you already have changes) or on the
-- public Landing Page ('landing'), managed from its own "Landing Page
-- Quizzes" tab in the Admin Portal. Both placements reuse the exact same
-- quiz builder, join flow and grading — this only changes WHERE a quiz is
-- listed for students to find it.
--
-- SAFE TO RE-RUN. Every statement is idempotent. No existing table, column
-- or row is dropped or modified — this only ADDS one column (with a
-- default, so existing rows are unaffected) plus a constraint and an index.
-- Existing quizzes, students, attempts, results, attendance, everything, is
-- left untouched.
-- ============================================================================

alter table quizzes add column if not exists placement text not null default 'quizzes';

alter table quizzes drop constraint if exists quizzes_placement_check;
alter table quizzes add constraint quizzes_placement_check
  check (placement in ('quizzes', 'landing'));

create index if not exists idx_quizzes_placement on quizzes (placement);
