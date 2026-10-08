# Update: Dashboard History, Admin Per-User Detail, Playground Persistence

## What was already there (unchanged, verified working)
This codebase already tracked and displayed most of what was asked for:
- **Student Dashboard**: cumulative percentage, every attended quiz, and a
  full drill-down into exactly what was submitted per question — including
  submitted code and which hidden test cases failed.
- **Quiz History**: every submitted attempt's answers, scores and results
  are already saved (`quiz_attempts` + `answers` tables) and already
  strictly scoped to `req.student.studentId` — a student can only ever see
  their own attempts.
- **Admin Dashboard**: an admin can already open any student's full detail —
  profile, quiz history, quiz-embedded coding answers, attendance, and a
  forced-logout activity log — gated behind `requireAdmin` on the whole
  admin router, plus a secure "Delete user" action.

## The real gap, and what this update adds
The standalone **Playground** ("Programming" tab) has always been public and
completely stateless — running code there never touched the database at
all, for anyone, signed in or not. That's the one piece of "programming
tasks" activity that wasn't being tracked. Fixed:

- **New `playground_runs` table** (`migration_playground_history.sql`, also
  folded into `schema.sql`), FK'd to `students` with `on delete cascade`, RLS
  enabled with no policies — same pattern as every other table in this
  project (all real access control happens in the Express layer).
- **New `optionalStudentAuth` middleware**: the Playground stays fully
  usable without signing in; when a valid account token IS sent, the run
  gets attributed and saved. An anonymous visitor's runs are never written
  anywhere.
- **Backend**: `POST /api/playground/run` now saves a signed-in student's run
  (best-effort — a save failure never breaks the Run button); new
  `GET /api/playground/history` returns the signed-in student's own runs
  only.
- **Student Dashboard**: new "Programming practice" section — every saved
  run with language/result/timing, and a detail view showing the exact
  code, input, output and errors.
- **Admin per-student detail**: new "Playground practice" table alongside
  the existing quiz history/attendance/activity sections, plus an updated
  summary count and delete-confirmation text.

## A note on "Courses"
This codebase does not currently have a Courses feature — it existed at one
point and was deliberately removed in an earlier round of work on this same
project (`backend/sql/migration_drop_courses_and_certificates.sql`). Nothing
in this update reintroduces it or fakes a Courses UI; the Dashboard and
Admin views cover the two things this project actually tracks activity for
— Quizzes and Programming (Playground) — plus progress/scores/history for
both. If a real Courses module is wanted, that's a separate, larger feature
to scope out.

## Data isolation & security (verified, not just asserted)
- Every student-facing endpoint filters by `req.student.studentId` taken
  from the verified JWT — never from a client-supplied id — so one student
  can never read another's data by guessing an id.
- Every admin endpoint sits behind `requireAdmin` on the whole router.
- I wrote a small in-memory mock of the Supabase query builder and ran the
  **actual controller code** (not a re-implementation) through it end to
  end, including real Python/C execution via the real judge:
  - A signed-in student's Playground run is saved and attributed correctly.
  - An anonymous run executes but is never saved.
  - Two different students' runs are stored as separate rows and each
    student's `GET /playground/history` returns only their own — zero
    cross-user leakage, confirmed by explicit overlap checks.
  - The admin per-student endpoint returns only the requested student's
    Playground runs, correctly excludes another student's rows, and the
    summary count matches.

## Database migration required
Run **`backend/sql/migration_playground_history.sql`** once in Supabase
(also included in `schema.sql` for fresh installs). Idempotent, adds one new
table, touches nothing existing.

## Verification performed
- `node --check` across every backend file (all pass).
- Real end-to-end tests of the new save/list/admin-detail logic against a
  mock database, as described above (no live Supabase available in this
  build sandbox — same limitation as every previous update to this
  project).
- Frontend: clean `npm install`, clean `vite build`, and `oxlint` — zero new
  lint errors (the only lint errors present are the same pre-existing
  `node_modules`-internal ones from before this update).
