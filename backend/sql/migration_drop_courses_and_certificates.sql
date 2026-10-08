-- ============================================================================
-- Remove Courses & Certificates completely (including database tables)
--
-- The Courses feature (student practice problems, PDF auto-import) and its
-- Certificates add-on were already removed from the frontend and backend in
-- an earlier update, but their tables were deliberately left in place at the
-- time in case a database had real data in them.
--
-- This migration finishes the job: it drops those tables outright. Run this
-- once in the Supabase SQL Editor if you ever ran the old
-- migration_courses.sql / migration_certificates.sql files. If you never
-- ran them (or already ran this file), every statement below is a no-op —
-- `drop table if exists` never errors on a missing table.
--
-- ⚠️ This is destructive for the tables listed below ONLY. Nothing else in
-- your database (quizzes, questions, students, quiz_attempts, answers,
-- results, admin accounts, rounds, attendance, notifications, ...) is
-- touched in any way.
-- ============================================================================

-- Certificates depended on Courses (course_completions.course_id → courses),
-- so drop it first to avoid a foreign-key error either way — `cascade` is
-- there as a safety net, not a requirement, since dropping in this order
-- never needs it.
drop table if exists course_completions cascade;
drop table if exists course_problem_progress cascade;
drop table if exists pdf_imports cascade;
drop table if exists course_problems cascade;
drop table if exists courses cascade;
