-- Adds a `details` column to student_logout_events for richer context on a
-- forced quiz-attempt logout (violations count / limit / attempt id at the
-- moment it happened), shown in the Admin Portal's Security Log. Safe to run
-- more than once. The backend already falls back gracefully if this has not
-- been run yet (see recordLogoutEvent in quizAttemptController.js).

alter table if exists student_logout_events
  add column if not exists details jsonb;
