-- ============================================================================
-- Maximum Attempt + Resume Quiz system: one active quiz session per
-- Register Number.
--
-- A student row already tracks quiz progress via `quiz_attempts`
-- (in_progress / submitted / auto_submitted) — that part already resumes
-- correctly (same attempt, same question order, same answers, same
-- server-authoritative timers). What was missing is a guard against the
-- SAME Register Number being logged into a quiz from two places at once.
--
-- These three columns hold that single lock:
--   active_session_token      - random id minted on join, embedded in the
--                                student's JWT as `sessionToken`.
--   active_session_quiz_id    - which quiz the lock belongs to.
--   active_session_started_at - when it was minted (used to auto-expire a
--                                stale lock left behind by a crashed
--                                browser/lost device, so a Register Number
--                                can never be locked out forever).
--
-- The lock is cleared (freeing the Register Number to log in again) when:
--   1) the student calls POST /api/students/logout (an explicit "log out",
--      which never touches the underlying quiz_attempts row — so rejoining
--      afterwards resumes the exact same in-progress attempt), or
--   2) the attempt is finalized (submitted / auto-submitted / time up), or
--   3) the lock is older than the stale-session window (6 hours), which is
--      treated as abandoned and cleared automatically on the next join.
--
-- Safe to re-run: every statement is idempotent and no existing column or
-- row is modified or dropped. Also folded into schema.sql for fresh
-- databases.
-- ============================================================================
alter table students add column if not exists active_session_token text;
alter table students add column if not exists active_session_quiz_id uuid references quizzes(id) on delete set null;
alter table students add column if not exists active_session_started_at timestamptz;

create index if not exists idx_students_active_session
  on students (active_session_token)
  where active_session_token is not null;
