-- ============================================================================
-- Student self-service Profile (photo / bio / username / password / batch)
--
-- Run this in the Supabase SQL Editor if your database was created before
-- this feature was added (it is also already included, inline, at the
-- bottom of schema.sql — so brand-new databases don't need this file).
--
-- SAFE TO RE-RUN. Every statement is idempotent. No existing table, column
-- or row is dropped or modified — this only ADDS three nullable columns to
-- `students`. Register Number is intentionally NOT touched by this feature;
-- it remains fixed and is never editable from Sign Up or the Profile page.
-- ============================================================================

alter table students add column if not exists bio text;
-- Stored as a data: URL (base64) — the app has no external file storage, so
-- small avatar images are kept inline. The API enforces a size limit on
-- write; this column has no length cap so existing rows are never at risk.
alter table students add column if not exists avatar_url text;
-- Sign Up / Profile: admission→graduation year range, e.g. "2024-2028",
-- picked from a dropdown built from a study duration (3/4/5 years) — never
-- free text. Independent of `year` (which is the guest quiz-join flow's
-- "current year of study", e.g. "Second Year") and of `department`/
-- `section` (already existed, shared by both flows).
alter table students add column if not exists batch text;
