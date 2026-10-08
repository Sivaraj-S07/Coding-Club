# Fixes applied — Eduverse project

## Latest pass — Maximum Attempt + Resume Quiz system

### What was already there
The quiz-taking engine already had solid resume infrastructure:
`quiz_attempts.status = 'in_progress'` rows are reused (never re-created) on
every `POST /quizzes/:id/start`, question order, saved answers (MCQ/coding/
fill-in-the-blank), server-authoritative per-question timers
(`question_timings`) and the current question index
(`quiz_attempts.current_question_index`) were all already restored exactly.
`max_attempts` was already enforced by counting `submitted`/`auto_submitted`
rows. What was missing was a guard against the **same Register Number being
mid-quiz in two places at once**, and one latent race condition in the
attempt-creation path. Both are fixed below — nothing about the existing
resume mechanics was changed.

### 1. One active quiz session per Register Number
New columns `students.active_session_token` / `active_session_quiz_id` /
`active_session_started_at`
(`backend/sql/migration_quiz_session_lock.sql`, also folded into
`schema.sql`). Pre-migration databases keep working exactly as before — the
lock is simply skipped until this is run (`featureSupport.sessionLockSupported()`).

- `backend/src/controllers/studentController.js` (`joinQuiz` /
  `acquireQuizSession`): on every `POST /api/students/login`, if this
  Register Number already holds a lock whose underlying attempt is still
  `in_progress` and the lock isn't stale, the join is rejected with a clear
  409 ("already has an active quiz session..."). Otherwise a fresh session
  id is minted, stored on the lock, and embedded in the issued JWT as
  `sessionToken`. A lock older than 6 hours is treated as abandoned (crashed
  browser, dead device) and is cleared automatically instead of locking a
  Register Number out forever.
- `backend/src/middleware/auth.js` (`requireActiveQuizSession`): applied to
  every quiz-taking route (`start`, `question/start`, `answer`, `code/run`,
  `code/submit`, `violation`, `round/complete`, `submit` — see
  `backend/src/routes/quizzes.js`). Compares the token's `sessionToken`
  against the student's current lock on every request, so a token superseded
  by a newer login (or ended via logout, below) is rejected instead of being
  allowed to keep saving answers. Only applied where the token actually
  carries a `sessionToken` (i.e. quiz-taking tokens) — the separate Dashboard
  account sign-in is completely unaffected, so browsing the Dashboard on a
  second device can never interrupt an in-progress quiz elsewhere.
- New `POST /api/students/logout` (`studentController.logoutSession`): clears
  **only** the session lock — the underlying `quiz_attempts` row is left
  exactly `in_progress`, untouched, so logging back in later (same device or
  a different one) resumes that exact attempt. A "Log out" button was added
  to the quiz header (`frontend/src/pages/student/QuizRunner.jsx`) with a
  confirm dialog that's explicit this is **not** Submit — nothing is graded
  and no attempt is used up.
- `backend/src/controllers/quizAttemptController.js` (`finalizeAttempt`):
  the lock is also released automatically the moment an attempt is
  genuinely finished (manual submit, auto-submit, or timeout), so a student
  doesn't need to explicitly log out before starting a different quiz.

### 2. Attempt-creation race condition (max-attempt logic robustness)
`startAttempt` previously inserted a new `quiz_attempts` row without
handling the case where two concurrent requests (a duplicate tab, a slow
network causing a retried click) both saw "no in-progress attempt yet" and
both tried to insert the same `(quiz_id, student_id, attempt_number)` —
the database's own unique constraint would then reject the second insert
and the request surfaced a raw 500. `startAttempt` now detects a unique-
violation on that insert and re-fetches the attempt the winning request
just created instead of erroring, so max-attempt accounting is never
double-counted and a duplicate tab/click can no longer break the flow. (The
single-session lock above already prevents this race across two different
logins; this covers the narrower case of two requests from the *same*
session.)

### Verified
- `node --check` on every file in `backend/src` — zero syntax errors.
- `npm install && npm run build` (frontend) — zero errors, same bundle
  shape as before plus the new logout button.
- Walked the exact resume scenario end-to-end against the code: join → start
  (attempt created, session lock set) → answer a few questions → simulate a
  crashed browser (no logout call) → rejoin from a second login attempt
  while the lock is still fresh → rejected with 409 → call `/students/logout`
  from the first (still-open) session → rejoin succeeds → `/start` returns
  the same `attemptId`, the same `question_order`, every previously saved
  answer, the same `current_question_index`, and timers computed from the
  original `question_timings` rows (not restarted) — confirming no new
  attempt is ever created and nothing is lost.
- Confirmed a database that hasn't run `migration_quiz_session_lock.sql`
  keeps joining/resuming exactly as before (feature silently no-ops).
- All previously existing features (proctoring/violations, rounds,
  per-question timers, coding judge, results, leaderboard, admin portal)
  were not touched and remain exactly as they were.

## Previous pass — Quiz Security: immediate logout on hard proctoring violations

The proctoring system already detected fullscreen exit, tab switching, new
tabs/windows, devtools, and page-navigation attempts — but only ended the
attempt once a *counted* limit (`tab_switch_limit`, default 3) was reached,
with softer signals (window focus loss, fullscreen exit) logged but never
enforced on their own. This pass makes the following reasons hard,
first-strike violations — a single occurrence ends the attempt immediately
(when the quiz's existing "Auto-submit" toggle is on, same as before):

- Tab switching / minimizing the window (`tab_switch`)
- App/window switching, e.g. Alt-Tab or clicking another app (`window_blur`,
  now with a 600ms grace window so a permission prompt or a brief
  lock-screen unlock via fingerprint isn't mistaken for it)
- Leaving fullscreen / secure quiz mode (`fullscreen_exit`)
- Attempting to leave the quiz page, e.g. the Back button (`navigation_attempt`)
- Opening another tab, window, or a third-party/external site — including
  from `window.open` and clicking any `http(s)` link — (`new_tab_blocked`)
- Opening developer tools (`devtools_attempt`)
- The PrintScreen key (`screenshot_attempt`) — see the honest limitation
  note below

**What changed:**
- `backend/src/controllers/quizAttemptController.js`: `logViolation` now
  computes a server-side, non-client-trusted `HARD_REASONS` set and ends the
  attempt (`finalizeAttempt` + logout event) on the *first* occurrence of any
  of them, instead of waiting for `violations_count` to reach
  `tab_switch_limit`. The quiz's `auto_submit` toggle remains the one
  overall on/off switch — turning it off (e.g. for a practice quiz) disables
  all automatic logout, hard or soft, exactly as before. `tab_switch_limit`
  still applies to any reason that stays outside `HARD_REASONS`.
- `frontend/src/hooks/useProctoring.js`: added PrintScreen detection
  (best-effort clipboard wipe + report) and gave window-blur ("app
  switching") a short grace window to cut false positives from permission
  prompts.
- `frontend/src/pages/student/QuizRunner.jsx`: updated violation copy for
  the now-immediate reasons, and added a small visible online/offline
  indicator so a connectivity drop is never mistaken for a security warning
  (a connection drop was already never reported as a violation — see
  `reportProctorEvent` — this only makes that visible to the student).
- `frontend/src/pages/admin/AdminSecurityLog.jsx`: added labels for the new
  `window_blur` / `fullscreen_exit` / `screenshot_attempt` reasons.
- `frontend/src/pages/admin/AdminQuizBuilder.jsx`: added a hint under
  "Tab-switch limit" and updated the "Auto-submit" description so admins
  know hard violations bypass the counted limit.

**Honest technical limitation (documented, not hidden):** no website can
detect a screenshot or recording taken with an OS-level tool that doesn't
touch the keyboard — Windows Snipping Tool / Win+Shift+S, macOS
Cmd+Shift+3/4, a phone camera pointed at the screen, or a separate capture
app. There is no browser API for this, on any browser, for any website.
The only screenshot-adjacent signal a page can ever observe is the plain
PrintScreen key (which on Windows copies the whole screen to the clipboard),
so that's what's detected here. Likewise, a browser can only *warn* before a
tab is closed or navigated away from (`beforeunload`) — it cannot block the
action outright; and "Wi-Fi Settings access" is an OS-level control no
website can open — the app already only checks connectivity status
(`navigator.onLine`), which is the actual web-platform equivalent, and
requests no other device/system permission anywhere in the quiz flow.

Verified with a clean `npm run build` (frontend, zero errors/warnings) and
`node --check` on every touched backend file.

## Previous pass — Forced-logout redirect goes back to the right listing page

The "You've been logged out" popup (shown when the proctoring system
auto-submits an attempt for too many violations) always sent the student to
`/quizzes` afterwards, even if they'd joined from Demo Quiz. Fixed:

- `backend/src/controllers/quizAttemptController.js` (`startAttempt`) now
  includes `placement` ("landing" or "quizzes") on the `quiz` object it
  returns — it was already being selected (`select("*")`) and used
  elsewhere in the codebase the same way, just never surfaced to this
  endpoint. Pre-migration databases with no `placement` column simply fall
  back to `"quizzes"`, same as every other place this field is read.
- `frontend/src/pages/student/QuizRunner.jsx`: both the modal's close
  action and its "Back to Quizzes" button now navigate to `/demo-quiz` when
  `quiz.placement === "landing"`, and to `/quizzes` otherwise, instead of
  always going to `/quizzes`.

Nothing else changed — same modal, same wording, same trigger conditions.
Verified with `node --check` on the touched backend file and a clean
`npm run build` (no errors/warnings).

## Previous pass — Stronger quiz lockdown (fullscreen, wake lock, tab-switch)

The quiz-taking flow (`QuizRunner.jsx` + `useProctoring.js`) already forced
fullscreen and a Wake Lock on Start Quiz, blocked tab switching/new tabs/
devtools/clipboard/context menu, and warned on refresh/back/close. This pass
tightens two spots without touching any of that existing, working behavior:

1. **Never Sleep works on more browsers.** `navigator.wakeLock` isn't
   implemented in every browser (notably Firefox, and older Safari), so
   those students previously got no screen-sleep protection at all.
   `useProctoring.js` now falls back to the well-known "muted looping video"
   technique (a tiny 2×2px, silent `frontend/public/nosleep.mp4`, ~1.7KB,
   generated locally — no network fetch) whenever the real Wake Lock API is
   unavailable or is denied. It's started/stopped from the exact same
   `requestWakeLock`/`releaseWakeLock` calls QuizRunner already makes, so no
   other file needed to change.
2. **Leaving fullscreen now actually blocks the quiz**, not just a
   dismissible banner. `QuizRunner.jsx`'s fullscreen-exit prompt is now a
   full overlay covering the question/answers/palette/submit area (the
   sticky header with both timers stays visible above it, since the timer
   keeps running regardless) until the student clicks "Enter fullscreen"
   again. This is the practical ceiling of what a website can do — no
   browser lets JavaScript block the Escape key or OS window controls from
   leaving fullscreen — but the student can no longer keep answering
   questions while outside it.

No backend changes, no changes to the violation-counting rules, and nothing
about the existing tab-switch/new-tab/devtools/clipboard/shortcut blocking
was touched. Verified with a clean `npm run build` (no errors/warnings) and
`node --check` on the touched backend files (none were touched, so this is
just a build-integrity check).

## Previous pass — Participation search/PDF, Cumulative Percentage, Landing Media

### 1. Demo Quiz → Participate: search + Download PDF
- `frontend/src/components/admin/ParticipationTab.jsx` gained a Name /
  Register Number search box (same behavior as the one on Admin → Results)
  and a "Download PDF" button. All existing functionality — refresh, the
  per-row guarded delete, the desktop table / mobile card layouts — is
  unchanged.
- New `frontend/src/lib/exportParticipantsPdf.js`, styled to match the
  existing `exportResultsPdf.js` (same header band, table theme, footer),
  builds a landscape PDF of whatever is currently on screen (i.e. respects
  the search filter).
- `frontend/src/pages/admin/AdminQuizBuilder.jsx` now passes `quizTitle` down
  to `ParticipationTab` so the PDF header shows the quiz name.
- No backend changes — the participants endpoint already returned everything
  needed.

### 2. Admin → User Accounts: Cumulative Percentage
- `backend/src/controllers/adminStudentController.js` (`getStudentDetail`)
  now computes `cumulativePercentage` on the returned `student` object: total
  marks obtained across every graded attempt ÷ total marks possible across
  those same attempts (not an average of per-quiz percentages, so a 50-mark
  quiz counts for more than a 5-mark one). In-progress attempts are excluded.
  `null` when the student has no graded attempts yet.
- `frontend/src/components/admin/StudentDetailModal.jsx` displays it in the
  account-detail card. Since this modal is shared, it also now shows on
  Admin → Guest Accounts — no extra work needed there.

### 3. Landing/Home Page Management: Admin-managed media gallery
- New `landing_media` table (`backend/sql/migration_landing_media.sql`, also
  folded inline into `schema.sql` for fresh databases) — id, media_type
  (image/video), title, caption, storage_path, url, mime_type,
  file_size_bytes, sort_order, is_active, timestamps. RLS enabled, no
  anon/authenticated policies, same stance as every other table (only the
  service-role backend ever talks to Supabase).
- Files live in a Supabase Storage bucket (`landing-media` by default,
  `LANDING_MEDIA_BUCKET` env var to override) created automatically by the
  backend the first time an admin uploads something — nothing to configure
  by hand in the Supabase dashboard. The bucket is public-read so the
  (public, unauthenticated) Landing Page can load images/videos directly by
  URL instead of proxying every byte through the API.
- Backend: `backend/src/controllers/adminMediaController.js` (list / upload /
  update — title, caption, active toggle / reorder / delete, mirroring the
  existing `reorderQuestions` pattern) plus
  `backend/src/controllers/mediaController.js` (public,
  `GET /api/media/landing`, active items only, in admin-defined order).
  Routes added to `backend/src/routes/admin.js` (`/admin/media...`) and a new
  `backend/src/routes/media.js` (`/media/landing`), both mounted in
  `server.js`. Uploads go through `multer` (memory storage — nothing touches
  local disk, which matters on Render's ephemeral filesystem) via the new
  `backend/src/middleware/mediaUpload.js`. Per-type size caps default to 8MB
  (images) / 60MB (videos), overridable with `LANDING_MEDIA_IMAGE_MAX_MB` /
  `LANDING_MEDIA_VIDEO_MAX_MB`.
- Frontend: new `frontend/src/pages/admin/AdminLandingMedia.jsx`
  ("Landing Media" in the sidebar, `/admin/landing-media`) — upload form
  (title/caption + file picker), a card grid per item with Show/Hide,
  move up/down (reorder), and delete. Public `frontend/src/pages/student/
  Landing.jsx` gained a "Gallery" section (`LandingGallery`, same
  fail-silently / hide-if-empty pattern as the existing `LandingQuizzes`
  section) that renders active items in order.
- `backend/package.json` gained the `multer` dependency (previously removed
  along with the Courses feature — reintroduced here specifically for this
  upload flow); `package-lock.json` updated via `npm install`.

## Previous pass — Guest Accounts split, Batch/Department/Section, complete Courses removal

### 1. Admin: Search removed, click-to-detail kept in User/Guest Accounts
- Deleted `frontend/src/pages/admin/AdminSearch.jsx`, its `/admin/search`
  route, and its sidebar entry. Removed the decorative (non-functional)
  search box that sat next to the notification bell in `AdminLayout.jsx`.
- Its "click a student → full detail + quiz history" view was extracted into
  `frontend/src/components/admin/StudentDetailModal.jsx` and is now used by
  both `AdminUserAccounts.jsx` and the new `AdminGuestAccounts.jsx` — nothing
  about that functionality was lost, just moved off a dedicated page.

### 2. Guest Accounts vs. User Accounts
- `AdminUserAccounts.jsx` now shows only students with a `username` set
  (i.e. who completed Sign Up). A new `AdminGuestAccounts.jsx`
  (`/admin/guest-accounts`) shows only students without one — people who
  attended a quiz via the per-quiz login form but never signed up. Both keep
  their own search box (searching within that table only) and click-to-open
  detail modal.
- Backend: `GET /admin/students` gained an `accountType=registered|guest`
  filter (`backend/src/controllers/adminStudentController.js`); omitting it
  keeps the old "everyone" behavior.

### 3. Sign Up: Batch, Department, Section
- Sign Up now collects Department and Section (existing dropdown lists) plus
  a **Batch**: a Study Duration select (3/4/5 years) drives a computed
  dropdown of admission→graduation year ranges (e.g. "2024–2028") — never a
  free-typed value and never a plain "2/3/4 years" field.
  `frontend/src/lib/options.js` (`DURATIONS`, `getBatchOptions`) and
  `backend/src/utils/enums.js` (`isValidBatch`) implement this; the backend
  re-validates independently of the frontend.
- New `batch` column on `students`
  (`backend/sql/migration_student_profile.sql`, also folded into
  `schema.sql` for fresh databases).

### 4. Profile: edit Batch, Department, Section
- `Profile.jsx` gained Department/Section/Study-duration+Batch editing
  alongside the existing photo/bio/username. Unlike Sign Up, these three are
  optional to fill in here, so an account created before this feature
  existed isn't forced to complete them just to update a bio or photo.
  Register Number remains fixed everywhere, as before.

### 5. Courses & Certificates: complete removal
- Deleted `backend/sql/migration_courses.sql`,
  `backend/sql/migration_certificates.sql`, and
  `backend/sql/RUN_ALL_IN_SUPABASE.sql` (a bundle of schema + those two —
  no longer needed since `schema.sql` alone is self-contained and never
  included Courses tables in the first place).
- Added `backend/sql/migration_drop_courses_and_certificates.sql` — actually
  drops `courses`, `course_problems`, `course_problem_progress`,
  `pdf_imports`, `course_completions` from any database that ran the old
  migrations. Nothing else is touched.
- Removed dead code/config that only existed for this feature:
  `backend/src/utils/dbErrors.js` (unused), `GEMINI_*`/`SMTP_*`/
  `PDF_IMPORT_MAX_MB` env vars (`backend/src/config/env.js`), the `multer`/
  `pdfkit`/`pdf-parse`/`nodemailer` npm dependencies
  (`backend/package.json`), and `backend/src/assets/certificate-logo.png`.
  Cleaned up a few stray code comments that referenced Courses.
- `README.md` updated throughout to match (setup instructions, section 16,
  the features list).

Everything above was verified with a clean `npm run build` (no errors) and
`node --check` on every touched backend file. Sign In and the Dashboard
still work unchanged even on a database that hasn't run
`migration_student_profile.sql` yet (graceful fallback, same pattern as the
previous pass) — only Sign Up's Batch field and Profile editing require it.

## Previous pass — Profile, Results/Live search, and nav restructuring

### 1. Profile section (edit photo, bio, username, password — Register Number fixed)
- **Backend**: new columns `bio`, `avatar_url` on `students`
  (`backend/sql/migration_student_profile.sql`, also folded into
  `schema.sql` for fresh databases — run the migration file if your
  database already exists).
  - `PUT /api/students/account` — update username / bio / photo. Register
    Number is never accepted; it is immutable by design.
  - `PUT /api/students/account/password` — change password, requires the
    current password, rate-limited like Sign In.
  - Sign In and `GET /api/students/account` fall back gracefully to the old
    columns if the profile migration hasn't been run yet, so existing Sign
    In / Dashboard behavior is never broken by this change.
- **Frontend**: new `/profile` page (`frontend/src/pages/student/Profile.jsx`),
  protected the same way as `/dashboard`. Photo upload is resized/cropped to
  a small square JPEG client-side before upload. Dashboard got a "Edit
  profile" shortcut tile and now shows the avatar if set.

### 2. Name / Register Number search in Results & Live Monitoring
- `frontend/src/pages/admin/AdminResults.jsx` and
  `frontend/src/pages/admin/AdminLive.jsx` both got a search box that filters
  by student name or register number.
- The "View attempt" modal (student details + full per-question breakdown,
  including submitted code for coding questions) was extracted into a shared
  component, `frontend/src/components/admin/AttemptDetailModal.jsx`, and is
  now available from both pages. Live Monitoring rows link to it via a new
  `attemptId` field returned by `GET /api/admin/live/:quizId`.

### 3 & 4. Navigation
- Signed-out visitors (Landing Page): **Home, Landing Quiz, Programming**,
  with **Sign In** / **Sign Up** on the right.
- Signed-in students: **Dashboard, Quizzes, Programming, Profile** only — no
  Home, no Sign In/Sign Up. A separate "Sign out" action remains available.
- "Landing Quiz" scrolls to the existing landing-placement quizzes section on
  the Home page (`#landing-quiz`); it is not a new page, so no existing quiz
  data or admin workflow changed.
- `frontend/src/components/StudentNavbar.jsx` now switches its entire menu
  based on `isAuthenticated`, rather than mixing both audiences in one list.

Everything above was verified with a clean `npm run build` (no errors) and
`node --check` on every touched backend file. No existing route, column, or
component was removed — only added to or, where noted, given a
backward-compatible fallback.

## Previous pass — Console Clear must stop the running program, not just hide it

### The problem
Across all three code consoles (Playground / "Programming" page, the
Programming-tab console on a course problem, and the quiz's coding
console), clicking **Clear** only reset what was on screen
(`setResult(null)` / `setTranscript("")`). It never cancelled the in-flight
Run/Submit request. Two consequences:

1. The compiled/interpreted program kept running **on the server** until it
   hit its own timeout (up to 15s for Java) — genuinely running "in the
   background" with nothing watching it, exactly as reported.
2. If that abandoned request finished *after* the student cleared the
   console, its result would pop back into the (supposedly cleared) output —
   confusing and wrong.

The quiz's coding console (`CodingWorkspace.jsx`) additionally had no Clear
button at all.

### Fix — frontend
`frontend/src/lib/api.js`: `apiFetch`/`performFetch` now accept and forward
a standard `signal` option, and let `AbortError` propagate distinctly from a
real network failure so callers can tell "the student cancelled" apart from
"the server is unreachable."

Each of the three consoles now tracks its currently in-flight request via an
`AbortController` ref:
- `frontend/src/pages/student/Playground.jsx`
- `frontend/src/pages/student/CourseProblem.jsx`
- `frontend/src/components/student/CodingWorkspace.jsx` (quiz console — also
  gained its first-ever Clear button, wired to the same `Console` component
  used everywhere else)

Clear now: aborts the in-flight controller (if any) → immediately flips
`running`/`submitting` back to `false` → clears **both** the output/
transcript and the stdin box. The `catch` blocks around each Run/Submit call
detect `err.name === "AbortError"` and return silently — no error toast, and
no stale response is allowed to overwrite state after a cancel (guarded by
comparing the ref to the controller that started the request). Every
console also aborts its in-flight request on unmount, so navigating away
mid-run doesn't leave anything dangling either.

### Fix — backend (this is what actually stops the program)
Aborting the fetch on its own only stops the *browser* from waiting; the
Node process on the server was still compiling/running the student's
program with no way to hear about the cancellation. New helper
`backend/src/utils/requestAbort.js` (`abortSignalForRequest(req, res)`) ties
a real `AbortSignal` to the response's `"close"` event (fires on both a
normal completed response and an early client disconnect, so one handler
covers both safely).

That signal is now threaded end-to-end through the whole execution stack:
- `backend/src/utils/localRunner.js` — `spawnWithTimeout` and
  `executeLocally` kill the child process (`SIGKILL` the process group,
  same path as a timeout) the instant the signal aborts, instead of letting
  it run out its full timeout budget unattended. Added a distinct
  `"aborted"` status so this is never confused with
  `"time_limit_exceeded"`.
- `backend/src/utils/codeRunner.js` — `executeCode`, the remote
  Piston path (`executeRemotely`/`callPiston`), and `runTestCases` (the
  hidden-test-case loop used by Submit) all check/forward the signal, so a
  cancelled Submit stops between test cases too, not just on a single Run.
- `backend/src/utils/wandboxRunner.js` — same treatment for the
  key-less Wandbox fallback.
- Wired into every route that can start student code:
  `playgroundController.runSnippet`, `courseController.runProblem` /
  `submitProblem`, and `quizAttemptController.runCode` / `submitCode`. Each
  creates the signal, passes it down, and guards against writing to an
  already-closed socket. `submitProblem`/`submitCode` additionally skip
  persisting a verdict to the database if the run was aborted before
  grading finished — a cancelled submission never gets recorded as a
  partial/incorrect official attempt.

### Verified
- `node --check` on every single `.js` file in `backend/src` — zero syntax
  errors.
- `npm install && npm run build` (frontend) — zero errors, same bundle
  shape as before.
- `oxlint` — same 103 pre-existing baseline errors, zero new errors or
  warnings on any file touched by this change.
- Live functional test (real backend process, real Node child processes):
  started a Python program with an intentional infinite loop and a 30s
  timeout, aborted the request after 500ms exactly like the frontend's
  Clear button would, and confirmed via `ps aux` that the interpreter was
  actually killed within ~500ms — not left running in the background for
  the remaining ~29.5s.
- Confirmed normal (non-cancelled) runs are unaffected and still fast:
  Python ~27ms, C/C++ ~3ms for a simple "hello world," across the
  `/api/playground/run` endpoint with a live server.

---


## Prompt 5 — PDF upload stuck on "Processing" + Manual Course Creation not working

### 1. PDF upload could hang on "Processing" forever
Root cause was two independent, stackable failure modes, both now fixed:

- **No timeout anywhere in the Gemini call chain.** Node's `fetch` has no
  default timeout, and Gemini's own model card notes it "may exhibit...
  occasional slowness or timeout issues." A single stalled request had
  nothing to time it out, so the whole import could sit unfinished
  indefinitely with the `pdf_imports` row stuck at `status: "processing"`.
  Fixed with a per-request `AbortController` timeout (`GEMINI_TIMEOUT_MS`,
  default 45s, retried like a 429/503) in `courseAiExtractor.js`, **plus** a
  hard ceiling on the whole extraction+creation pipeline
  (`PDF_IMPORT_JOB_TIMEOUT_MS`, default 15 minutes) in
  `adminCourseController.js`'s `runImportJob`, so the import record is
  *always* moved out of "processing" one way or another.
- **Unhandled promise rejections could crash the whole backend process.**
  Progress-note updates (`onProgress(...)`) are called fire-and-forget (not
  awaited) from deep inside the extraction pipeline, by design — so a slow
  Gemini call isn't blocked on a DB round-trip just to post a status
  string. If that update ever rejected, it became an *unhandled rejection*,
  which by default terminates the entire Node process (Node ≥15) — taking
  down every other in-flight request, including an unrelated admin action
  like Manual Course Creation, at the same time. `setProgress` now swallows
  its own errors, and `server.js` adds `unhandledRejection`/
  `uncaughtException` listeners as a second safety net so a stray rejection
  anywhere just gets logged instead of killing the process.
- **`pdf-parse` itself can hang** on a malformed/oversized PDF, and this
  runs synchronously in the upload request *before* any `pdf_imports` row
  even exists — an unbounded hang here showed up as the Upload button
  spinning forever with nothing to retry. Now capped with its own timeout
  (`PDF_PARSE_TIMEOUT_MS`, default 30s) in `pdfExtract.js`.

### 2. Manual Course Creation silently appearing to do nothing
- `getSupabase()` threw a plain `Error` instead of an `ApiError` when
  `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` were missing. The global error
  handler only forwards the real message for `ApiError`s — a plain `Error`
  is treated as an unexpected failure and its message gets replaced with a
  generic "Internal server error", hiding the actual, actionable cause from
  the admin. Every route using `getSupabase()` (course creation included)
  was affected. Fixed to throw `ApiError` so the real message always
  reaches the client.
- Every database error surfaced to the admin was just the raw Postgres/
  PostgREST message (e.g. `relation "courses" does not exist`, or
  PostgREST's `PGRST205` schema-cache-miss). New `backend/src/utils/
  dbErrors.js` (`describeDbError`) recognizes the common cases — missing
  table/migration, out-of-date column, check/foreign-key constraint
  violations, network failures reaching Supabase — and turns them into a
  clear, actionable sentence (e.g. "run `backend/sql/migration_courses.sql`
  in your Supabase project's SQL editor"). Applied across every course/
  problem/import create-update-delete path in `adminCourseController.js`.
- Frontend: error toasts now stay up 9s instead of 4s (`Toast.jsx`) so a
  longer, actionable message is actually readable before it disappears.

### 3. Verified with a mocked-Supabase / mocked-Gemini integration harness
Since this sandbox has no network access to the project's real Supabase or
Gemini endpoints, an in-memory fake of the supabase-js query-builder surface
plus a stubbed `global.fetch` were used to exercise the real, unmodified
controller code end-to-end (not just read it). All of the following pass:

1. Manual course creation, happy path — course row created, correct shape
   returned, 201 status.
2. Manual course creation, missing title — clean 400, not a silent failure.
3. Missing Supabase config — now surfaces the actionable message via a
   proper `ApiError` instead of "Internal server error".
4. Missing `courses` table (`42P01`/`PGRST205`) — now surfaces the
   migration-file hint instead of an opaque 500.
5. Full PDF import pipeline, happy path — manifest → per-problem expansion
   → Final Assessment generation → course + `course_problems` + `quizzes` +
   `questions` (+ MCQ options) rows all created automatically, import
   record ends `approved` with `course_id` set.
6. A Gemini call that **never resolves** — confirmed the import now times
   out and cleanly reports `status: "failed"` with a clear timeout message,
   instead of hanging on `"processing"` forever (this is the exact bug
   reported).
7. A hanging `pdf-parse` call — confirmed `extractPdfText` now fails fast
   instead of blocking the upload request indefinitely.
8. Gemini 429 rate-limit retry logic (added in an earlier pass) — confirmed
   it still works correctly alongside the new per-request timeout.

Also re-verified this pass, unchanged:
- `node --check` on every single `.js` file in `backend/src` — zero syntax
  errors.
- `npm install && npm run build` (frontend) — zero errors, same bundle
  shape as before.
- `oxlint` — same 103 pre-existing baseline errors, zero new errors or
  warnings on any file touched by this change.

### What you still need to do
This sandbox cannot reach your real Supabase project or the Gemini API
(both endpoints are outside its network allowlist), so the fixes above were
verified with realistic mocks rather than your live services. Before
testing for real:
1. Confirm `backend/sql/schema.sql` → `migration_courses.sql` →
   `migration_certificates.sql` have all been run, **in that order**, in
   your Supabase project's SQL editor. If Manual Course Creation still
   fails after this update, the new error message will now tell you
   exactly which of these is missing instead of a generic failure.
2. Confirm `GEMINI_API_KEY` in `backend/.env` is a valid, currently-active
   key for the model in `GEMINI_MODEL` (`gemini-3.6-flash` by default) — a
   bad/expired key now fails fast with a clear "Gemini API request failed
   (401/403)" message instead of any ambiguity.
3. Restart the backend after pulling this update so the new timeout/
   error-handling code is actually running.

---


## Prompt 4 — Mobile responsiveness + Gemini API migration

### Mobile responsiveness
The app was already built mobile-first in most places (quiz runner, course
pages, Playground, forms all already had `sm:`/`lg:` breakpoints and
`overflow-x-auto` tables). Two real gaps were fixed:

- **Admin Portal** (`AdminSidebar.jsx`, `AdminLayout.jsx`): the sidebar was
  `hidden lg:flex` with no mobile alternative at all — Admin was unusable
  below the `lg` breakpoint. Added a slide-in drawer (`AdminSidebarDrawer`)
  opened by a hamburger button in the header, sharing the same nav-link
  markup as the desktop rail so they can't drift apart. The header row now
  wraps instead of squeezing when a page's action buttons don't fit.
- **Student navbar** (`StudentNavbar.jsx`): five nav links had no mobile
  fallback — added a hamburger dropdown menu below `md`.
- A few 2-column forms (`AdminQuizBuilder.jsx`, `AdminCourses.jsx`) were
  forced to `grid-cols-2` with no mobile stacking; changed to
  `grid-cols-1 sm:grid-cols-2`.
- `index.css`: inputs/selects/textareas now render at 16px on screens under
  640px so focusing a field doesn't trigger iOS Safari's automatic
  zoom-in; added a page-level `overflow-x: hidden` safety net.

### Anthropic → Google Gemini
`backend/src/utils/courseAiExtractor.js` (Admin → Courses → Upload PDF) was
rewritten from the Anthropic Messages API to Google's Gemini
`generateContent` REST endpoint, called via Node's built-in `fetch` (no new
SDK dependency). Uses Gemini's native `responseMimeType: "application/json"`
so the model returns raw JSON directly, with the same defensive
markdown-fence-stripping fallback as before. Same three-stage pipeline
(manifest → per-problem expansion → Final Assessment) and same exported
function signatures, so `adminCourseController.js` needed no changes.

- `backend/src/config/env.js`: `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` →
  `GEMINI_API_KEY`/`GEMINI_MODEL` (default `gemini-3.6-flash`).
- `backend/package.json`: removed `@anthropic-ai/sdk`.
- `backend/.env`, `backend/.env.example`, `README.md`: updated accordingly.

Verified with `node --check` across every backend file, a clean
`npm install` (confirms no leftover `@anthropic-ai/sdk` references in the
lockfile), and a clean frontend `vite build`. The Gemini call itself
could not be exercised end-to-end in this sandbox (no network access to
`generativelanguage.googleapis.com`).

### Follow-up: default model name update
The first pass shipped with `GEMINI_MODEL` defaulting to `gemini-2.5-flash`.
Testing against a live key returned `404: This model models/gemini-2.5-flash
is no longer available to new users` — Google has moved new API keys onto
newer models. Default updated to `gemini-3.6-flash` (the model the error
message itself pointed to) in `env.js`, `.env`, `.env.example`, and
`README.md`. If Google rotates model availability again, this is a one-line
change: set `GEMINI_MODEL` in `backend/.env` to whatever `gemini-*` name
your key currently supports — the extractor never hardcodes a model name.

## Prompt 3 — PDF course upload wasn't creating the course

### Root cause
The PDF import pipeline (upload → AI extraction → structured problems/
assessment) was working correctly, but it **stopped one step short**: after
extraction finished, the import just sat in a `ready_for_review` state and
required the admin to open a separate review screen and click "Approve &
create course" before anything was written to `courses` / `course_problems`.
If that click never happened (or the admin didn't know to look for it), the
extracted content never became a real course — matching exactly what was
reported ("the course is not being automatically created").

### Fix
`backend/src/controllers/adminCourseController.js`

- Factored the course-creation logic (insert `courses` row, insert all
  `course_problems` rows, materialize the Final Assessment as a `quizzes` +
  `questions` row set) out of the old `approveImport` handler into a shared
  `createCourseFromImportData()` function.
- `runImportJob` (the background job started by `POST
  /admin/courses/import/pdf`) now calls this function **immediately after
  extraction succeeds** — the course, its problems, and its assessment are
  created automatically, with zero admin clicks. The import record is marked
  `approved` and linked to the new `course_id` right away.
- **Failure isolation, so one bad step can't silently lose work:**
  - If AI extraction itself fails (e.g. missing `ANTHROPIC_API_KEY`, bad
    PDF), the import is marked `failed` with the real error message — no
    partial course is ever created.
  - If extraction *succeeds* but the course-creation step fails (e.g. a
    transient DB error), the import falls back to `ready_for_review` with
    the extracted data intact, so the admin can fix/retry from the review
    screen instead of re-uploading and re-extracting the whole PDF.
  - If the course row is created but its problems fail to save, the
    orphaned, problem-less course row is deleted automatically — the Admin
    Portal never shows a broken half-course.
- `backend/src/routes/admin.js`: the PDF-upload file filter now raises a
  proper `ApiError(400, "Only PDF files are accepted")` instead of a plain
  `Error` (which the global error handler was turning into an opaque
  "Internal server error" instead of the intended message), and a new
  `pdfUploadSingle` wrapper turns multer's own errors (e.g. "file too large")
  into the same clean 400 shape.
- `backend/src/controllers/adminCourseController.js` (`getImport`): now also
  returns `course_id` so the frontend can redirect to the finished course.

`frontend/src/pages/admin/AdminCourseImportReview.jsx`

- Once an import reports `status: "approved"`, the review page now
  auto-redirects straight to the newly created, fully editable course page
  (`/admin/courses/:id`) instead of waiting for a manual "Approve" click that
  no longer exists in the normal flow.
- The `ready_for_review` screen (title/description/problems editor +
  Approve button) is kept as-is — it's now only reached in the fallback case
  where extraction succeeded but automatic creation failed, so the admin can
  fix and retry without re-uploading.

### What this means for the existing manual course flow
Unchanged. `POST /admin/courses`, `POST /admin/courses/:courseId/problems`,
and the whole Admin → Courses → New Course / Edit UI use entirely separate
handlers (`createCourse`, `createProblem`, `updateProblem`, …) that were not
touched.

### Verified
- `node --check` on every changed backend file; the real Express server
  boots cleanly with no `.env` (clear warning, no crash) and with a stub
  `.env` (routes respond, auth guard on `/admin/courses/import/pdf` works).
- A full in-memory simulation of `uploadPdfImport` → its background
  `runImportJob`, with a fake Supabase client and a stubbed AI extractor
  (no network/API key needed): confirmed the course, both extracted
  problems, the Final Assessment quiz, its 3 questions (MCQ + programming +
  fill-in-the-blank), and its 4 MCQ options are all created correctly, and
  the import record ends up `approved` and linked to the new course id.
- Same simulation for the three failure paths above (extraction fails / DB
  insert of the course fails / DB insert of the problems fails after the
  course was created) — confirmed each produces the intended, non-destructive
  state with assertions on every table.
- `npm run build` (frontend) — zero errors. `npm run lint` (oxlint) — 103
  errors, the same pre-existing baseline noted in earlier passes; no new
  errors on any file touched by this change.
- Confirmed the manual course/problem creation endpoints and their frontend
  forms are byte-for-byte unmodified.

---

## Prompt 2 — Assessment gate, progress, certificates & email

### 1. New database tables/columns
`backend/sql/migration_certificates.sql` (run **after** `migration_courses.sql`
— not appended into `schema.sql`, same reasoning as `migration_courses.sql`
itself: `schema.sql` must stay runnable standalone on a brand-new database,
before Courses/`courses` exists at all).

- `course_completions` — one row per (course, student): problems
  completed/total, last assessment percentage/pass, `status`
  (`in_progress`/`completed`), certificate id + issue time, email
  status/sent-at/error. This is the single source of truth the Dashboard,
  `CourseDetail`, and the Admin "Certificates" panel all read from.
- `attendance.device_id` — the anonymous per-browser device id (already used
  for practice-problem progress) is now also recorded at Final Assessment
  login time, so a passed attempt can be matched back to the right device's
  solved-problems for gating and certificate data.
- Entirely additive/idempotent — nothing existing is altered, and a database
  that hasn't run this migration keeps working exactly as before (probed via
  `featureSupport.courseCompletionsSupported()`; the gate, certificates and
  emails just stay off until it's applied).

### 2. Gate: must solve every problem before the Final Assessment
`backend/src/controllers/studentController.js` (`joinQuiz`)

- When the quiz being joined is a course's `assessment_quiz_id`, joining now
  requires: (a) an `X-Device-Id` header, and (b) every `course_problems` row
  for that course to have a `solved` `course_problem_progress` row for that
  device — otherwise a 403 with the exact remaining count is returned.
- An **email** field is now required (and validated) on this one quiz type
  only — used to send the certificate. Every other (non-course) quiz's
  registration form is completely unchanged (no new required field).
- `frontend/src/pages/student/QuizLogin.jsx` shows the email field and a
  short explanatory banner only when `GET /api/quizzes/:id` reports
  `isCourseAssessment: true`; sends `X-Device-Id` on the join request.
- `frontend/src/pages/student/CourseDetail.jsx`'s "Take Final Assessment"
  button is replaced with a disabled **Locked** state (with a lock icon)
  until every problem is solved.

### 3. Certificate generation & email
`backend/src/utils/certificate.js`, `backend/src/utils/mailer.js`,
`backend/src/controllers/quizAttemptController.js` (`maybeCompleteCourse`,
called from `finalizeAttempt` — the single choke point for manual submit,
auto-submit, and timeout, so every submission path is covered).

- On every graded course-assessment attempt, `course_completions` is
  upserted with the latest problems/percentage/pass status (so Dashboard
  always shows accurate progress and results, pass **or** fail).
- The **first time** a student has both solved every problem and passed,
  a unique certificate id (`CC-YYYYMMDD-XXXXXX`) is generated and a
  certificate PDF is rendered on the fly with `pdfkit` (landscape, club
  branding, student name, course title, register number, score, date,
  certificate id) — verified visually by rendering and inspecting it.
  Certificates are **never persisted to disk**: both emailing and
  downloading regenerate the identical PDF from the `course_completions`
  row, so nothing is lost on a server restart/redeploy.
- The PDF is emailed to the student's registered address via Gmail SMTP
  (`nodemailer`, configured with `SMTP_USER`/`SMTP_PASS` — an App Password —
  in `backend/.env`). Entirely best-effort/fail-soft: a mail outage or
  missing SMTP config only marks `email_status` as `failed`/`disabled` on
  the completion row — it can **never** break quiz grading or submission.
  Verified by booting the real server with a stub environment and hitting
  every new endpoint (validation, auth, and DB-failure paths) — confirmed
  correct status codes and that a downstream failure never crashes the
  process.
- Admins can **resend** a certificate email from the new Certificates panel
  (see below) — useful if a student mistyped their address.

### 4. Downloading a certificate
`backend/src/controllers/courseController.js` (`downloadCertificate`,
`GET /api/courses/:id/certificate`), `frontend/src/lib/certificate.js`

- Regenerates and streams the PDF for the requesting device's completed
  course. Used from both `CourseDetail.jsx` (assessment card) and
  `Dashboard.jsx` ("Your certificates" section).

### 5. Dashboard: progress, completed courses, assessment status, certificates
`frontend/src/pages/student/Dashboard.jsx`

- New summary tiles: **Courses completed** and **Certificates earned**
  (alongside the existing problems-solved/attempted/courses-started tiles).
- New **"Your certificates"** section — one card per certified course with a
  **Download** button.
- Each course card now shows an assessment-status pill: **Assessment
  locked** / **Assessment ready** / **Failed — N%** / **Certified**.

### 6. Admin visibility
`backend/src/controllers/adminCourseController.js` (`listCompletions`,
`resendCertificateEmail`), `frontend/src/pages/admin/AdminCourseBuilder.jsx`

- New **"Progress, results & certificates"** panel on each course's admin
  page: a table of every student who has attempted the Final Assessment —
  problems solved, last score, certificate id, email delivery status, and a
  one-click **resend email** action.

### 7. Verification performed
- Installed a real local PostgreSQL and ran `schema.sql` →
  `migration_courses.sql` → `migration_certificates.sql` in order (twice, to
  confirm idempotency) with **zero errors**; this also caught and fixed a
  latent ordering bug (a `courses`-dependent block had been appended into
  `schema.sql`, which must stay standalone-runnable — see README §4).
- Simulated the entire flow with raw SQL against that real database (course
  → problems → solved progress → passed attempt → certificate issuance) and
  confirmed the exact queries the controllers use return the right rows,
  including the unique constraint correctly rejecting a duplicate
  certificate for the same student+course.
- `node --check` on every backend file; booted the real Express server and
  exercised the new/changed endpoints end-to-end (validation errors, auth
  errors, graceful DB-failure handling — server never crashed).
- `npm run build` (frontend) — **zero errors**; `npm run lint` (oxlint) shows
  **no new errors or warnings** on any file touched by this change (same 103
  pre-existing baseline errors as the unmodified project).
- Confirmed no regression to existing `attendance` consumers (
  `adminAttendanceController.js`, `adminParticipantController.js`,
  `adminResultsController.js`) — all use explicit column lists that don't
  include the new `device_id` column, or `select("*")`, so the additive
  column is fully backward compatible.

---

## Previous pass — larger editor, correct operator rendering, admin "View attempt"

### 1. Editor size & comfort
`frontend/src/components/student/CodeEditor.jsx`

- The editor now fills a configurable height (defaults to `56vh`/`52vh` —
  roughly half the screen) instead of a fixed ~430px box, with a **Full
  screen** toggle (button, or `Esc` to exit) for even more room on long
  programs. Both the quiz workspace (`CodingWorkspace.jsx`) and the
  standalone Programming playground (`Playground.jsx`) use the larger sizing.
- Font size bumped from `text-sm`/`leading-relaxed` to `text-[15px]`/
  `leading-7` for more comfortable typing, matching a real code editor.
- The gutter (line numbers) and the text area still scroll in perfect sync,
  and now both reliably expose the **entire** program — nothing is clipped;
  everything beyond the visible height is reachable by scrolling (mouse
  wheel, trackpad, or scrollbar), in both the normal and full-screen modes.
- No behavior change to typing, Tab-indent, auto-indent on Enter, or
  `value`/`onChange` — only sizing/presentation changed.

### 2. Operators (`<=`, `>=`, `==`, `!=`, `<`, `>`) rendering incorrectly
`frontend/src/index.css`, `CodeEditor.jsx`, `Console.jsx`

Root cause: the code font (JetBrains Mono) ships with **programming
ligatures** enabled by default in the browser, which visually *fuses*
sequences like `<=`, `>=`, `==`, `!=`, `->` into a single merged glyph. The
characters typed, stored, compiled and executed were always correct — this
was a display-only issue, but a confusing one in a compiler/editor context
where students need to see (and trust) the literal characters they typed.

**Fix:** ligatures are now explicitly disabled everywhere the monospace font
renders code — a global rule for every `.font-mono` element in `index.css`
(`font-variant-ligatures: none` + `font-feature-settings: "liga" 0, "clig" 0,
"calt" 0, "dlig" 0`), plus the same setting applied inline on the editor
textarea and the console/output panes as defense in depth. Verified this
does not affect execution — Python, C, C++ programs using `<=`, `>=`, `==`,
`!=` inside conditionals were compiled and run directly against the local
toolchain (`localRunner.js`) with correct results (e.g. a C program with
`if (x >= 10 && x <= 20)` and a C++ program with `if (a != b)` both executed
and produced the correct branch), confirming the operators were never
mis-executed — only mis-*displayed* before this fix.

### 3. Admin Results — "View" per attempt
`frontend/src/pages/admin/AdminResults.jsx`

- Added a **View** (eye icon) button next to each row's existing Delete
  button, opening a modal (reusing the existing `Modal` component) with:
  - Score, percentage, correct/wrong/unanswered counts, pass/fail status
  - Every question the student attended, in order, each showing:
    - **MCQ**: the option the student selected vs. the correct option
    - **Fill in the blank**: the student's submitted blank(s) vs. the correct
      blank(s)
    - **Coding**: the language, the exact submitted source code (rendered
      with ligatures disabled, same as the editor, so operators are legible),
      and marks awarded
  - Per-question correctness badge (Correct / Partial / Wrong / Unanswered)
    and marks awarded out of the question's total marks.
- This uses the **existing** backend endpoint `GET /api/admin/results/:attemptId`
  (`adminResultsController.getResultDetail`) — already implemented and
  already wired into `routes/admin.js` — no backend changes were needed for
  this feature; only the missing frontend UI was added.
- Existing Delete/PDF export/live-refresh behavior on the Results page is
  unchanged.

### 4. Compiler-style console (carried over, unchanged this pass)
The unified console (single panel with output + an always-visible stdin box,
Run/Submit in the console footer) added in the previous pass is untouched
and still used by both the quiz workspace and the Programming playground.

### Verified this pass
- Every `.jsx` file parses successfully (`esbuild`, JSX loader) and the full
  app bundles cleanly end-to-end with all internal imports resolved.
- All backend `.js` files pass `node --check`.
- The local judge (`localRunner.js` / `executeCode`) was exercised directly
  for Python, C and C++ with `<=`, `>=`, `==`, `!=` in real conditionals,
  plus compile-error, runtime-error and timeout cases — all reported the
  correct status and output. Java has no JDK installed in this build
  sandbox, so it correctly reports `judge_unavailable` here; this is an
  environment/installation matter (see "Still required from you" below),
  not a code defect — the same Java code path is otherwise unchanged from
  the already-verified previous pass.
- `npm install` could not be run in this build sandbox (outbound registry
  access is blocked here), so a full `vite build` was not executed; instead
  every source file was syntax-checked individually and the entire module
  graph was bundled with `esbuild` (all imports externalized to `react`,
  `react-dom`, `react-router-dom`, `lucide-react`, `recharts`,
  `socket.io-client`, `jspdf*`) with zero resolution or syntax errors. Run
  `npm install && npm run build` in `frontend/` in your normal environment
  to produce the production build; nothing in this pass changes package
  dependencies.


## 1. `+ New File` in Programming → My Programs
`frontend/src/pages/student/Playground.jsx`

- Added a **"New File"** button in the Programming toolbar (creates a file in
  the currently selected language) and a **"+"** button on each language
  folder in the "My Programs" sidebar (creates a file in that folder's
  language).
- New files get a unique, auto-suggested name (`program.py`, `program-2.py`,
  ...), start from the same starter template used for "Reset", and open
  immediately in the editor — ready to name, edit, save (`Save` button,
  unchanged), run (`Run Code`, unchanged) and delete (trash icon, unchanged).
- No existing behavior was touched: Save, Reset, Run, the Java "Add class"
  multi-file support, and the delete confirmation dialog all work exactly as
  before. Programs are still stored client-side in `localStorage`
  (`playground.programs.v1`), same schema as before, so any programs a
  student already saved are unaffected.

## 2. Root cause of install/build failures (the real "limit.exe"-adjacent bug)
`backend/package-lock.json`, `frontend/package-lock.json`

Both lockfiles had every package's `resolved` URL pointing at a **private,
access-restricted registry**
(`europe-west4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/...`) instead
of the public npm registry. Outside of that private environment, `npm ci` /
`npm install` fails immediately with `403 Forbidden`, which prevents the
backend from ever starting — so the compilers/toolchains never get exercised,
`node_modules` never gets created, and any run attempt breaks before it
reaches the judge. This is very likely what produced the confusing
`limit.exe` / `..._RUN` failure: without a working `npm install`, the backend
can't boot, so **the actual `main.exe` compiled by `gcc`/`g++` never runs**
inside a clean sandbox, and instead you get inconsistent leftover/partial
executables and generic OS-level failures depending on machine state.

**Fix:** regenerated both lockfiles against the public npm registry
(`registry.npmjs.org`). Verified with a clean `npm install` on a fresh
machine for both `backend/` and `frontend/` — 121 and 179 packages installed
respectively, no errors.

## 3. Program-execution hardening (C / C++ / Java / Python)
`backend/src/utils/localRunner.js`

The judge itself (`localRunner.js` / `codeRunner.js`) was already well
hardened against the classic causes of these errors (Windows "app execution
alias" stubs, missing `javac` on PATH, JVM/Python startup being mistaken for
a timeout, etc. — see `backend/README-judge.md`). One gap was closed:

- If the OS refuses to start a freshly compiled program with `EPERM` /
  `EACCES` — the signature of **antivirus or Windows SmartScreen quarantining
  an unsigned temp `.exe`**, the most common real-world cause of a mysterious
  `<name>.exe` failure on Windows — the judge now reports a clear
  `judge_unavailable` result with an actionable message (add a temp-folder
  antivirus exclusion) instead of leaking a raw, confusing OS error to the
  student.

### Verified end-to-end (this pass)
With `python3`, `gcc`/`g++`, and a JDK (`javac`/`java`) installed, the full
HTTP flow was exercised for all four languages through the real
`/api/playground/run` endpoint (not just unit-level):

| Language | Status |
|---|---|
| Python | ✅ `ok` |
| C | ✅ `ok` |
| C++ | ✅ `ok` |
| Java | ✅ `ok` |

Also verified: non-zero exit codes are reported as `runtime_error` with a
clean message, not a raw OS error.

## 4. Untouched (verified, not modified)
UI, database schema, REST APIs, JWT auth, quiz engine, admin portal, student
portal, and results/ranking logic were not touched. `npm run build` for the
frontend completes with no errors, and `oxlint` reports zero new
issues (two pre-existing, unrelated warnings in `Playground.jsx` about
`setState` inside `useEffect` were already present before this change).

## Still required from you (environment-specific, cannot be done in this sandbox)
1. Run `npm install` in both `backend/` and `frontend/` with the corrected
   lockfiles.
2. Install the four toolchains on whatever machine runs the backend:
   `python3`, `gcc`/`g++` (`build-essential` on Debian/Ubuntu, MSYS2/MinGW-w64
   on Windows), and a **JDK** (not just a JRE) — see
   `backend/README-judge.md` for exact commands, or run
   `npm run setup:compilers` / `npm run check:runtimes` in `backend/`.
3. If you still see a program blocked on Windows after that, add an
   antivirus/Defender exclusion for your OS temp directory (that's where the
   judge compiles and runs student code) — this is what the new error
   message will tell you if it happens again.

## Verification pass (this delivery)

Everything below was executed against the real running app in a clean sandbox
(`npm install` for both `backend/` and `frontend/`, backend on :5000 with the
local judge, frontend dev server on :5173, plus a headless-browser run):

- `npm install` + `npm run build` (frontend) — succeed with no errors.
- Judge: Python, C, C++ **and Java** (JDK 21) all compile and run correctly
  with `>=`, `<=`, `==`, `!=`, `<`, `>` in real conditionals and stdin piped
  in — all four return status `ok` with the expected output, both through
  `localRunner` directly and through `POST /api/playground/run`.
- Programming page: the editor renders at 70vh (≈1250px tall on a 1800px
  viewport) with synced line-number gutter and a Full screen toggle; typed
  operators display as literal characters (no ligature fusing).
- Console: input typed straight into the console's stdin box + **Run Code**
  executes and prints the program output and exit status in the same panel.
- Admin → Results: the per-row **View** (eye) button opens the attempt detail
  modal — score/percentage/correct-wrong-unanswered/pass-fail, and every
  question with the student's answer, the correct answer, submitted code,
  expected output, test cases and marks awarded. Verified against live data
  for both MCQ and coding questions. No console errors.
- All existing features (quiz runner, results export, live view, leaderboard,
  admin CRUD, auth) untouched.

---

## Prompt 5 — Admin Portal → Courses page was broken (route-ordering bug)

### Root cause
`backend/src/routes/admin.js` registered `GET /courses/:id` **before**
`GET /courses/imports`. Express matches routes in registration order, so
every request to `/admin/courses/imports` was being swallowed by the
`:id` route first (treating the literal word `"imports"` as a course id),
which then failed at the database with an invalid-UUID error instead of
ever reaching `listImports`.

The frontend's Admin → Courses page loads courses and PDF imports together
via `Promise.all([...])`, so this one failing call rejected the whole
`load()` — meaning the page could show **zero courses even when courses
existed**, and the "PDF imports in progress" panel never worked. This
matches exactly what was reported ("Admin Portal → Courses" broken).

Everything the request asked for — manual course creation, unlimited
programming problems per course, Final Assessment creation/edit in the
same module, the assessment-unlocks-after-all-problems gate, certificate
issued only after passing, and PDF-imported courses sharing the same
tables/flow as manual ones — was already correctly implemented in the
backend and frontend; this routing bug was the actual defect breaking the
module end-to-end.

### Fix
Moved the whole PDF-import route block
(`POST /courses/import/pdf`, `GET /courses/imports`,
`GET /courses/imports/:id`, `PUT /courses/imports/:id`,
`POST /courses/imports/:id/approve`, `DELETE /courses/imports/:id`) to
register **before** the `/courses/:id` param routes, with a comment
explaining why the order matters so it doesn't regress. No controller,
frontend, or database code needed to change — the bug was purely route
registration order.

### Verified
- `node --check` on every backend file — no syntax errors.
- Backend boots cleanly against a stub `.env` (no crash, correct startup
  log).
- Isolated route-dispatch test (Express app mounting just `admin.js` with
  a stubbed `requireAdmin`, hitting `GET /courses/imports`): before the
  fix this reached `getCourse` (500 "Failed to load course"); after the
  fix it reaches `listImports` (confirmed by its distinct error text,
  "Failed to load imports", with a stub Supabase URL that has no real
  DB behind it).
- Frontend `npm run build` — zero errors, same output bundle as before.
- Manual/PDF course creation, problem CRUD, Final Assessment
  generation/edit, the assessment-unlock gate, and certificate issuance
  logic were all audited and confirmed already correct — untouched.
