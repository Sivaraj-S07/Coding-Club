# Eduverse — Quiz, Learning & Collaboration Platform

> **Team Insights:** see `EDUVERSE-TEAM-INSIGHTS-UPDATE.md` for the Team Search / Team insights enhancement (optional index migration: `backend/sql/migration_team_insights.sql`).


**Latest release:** Start with [EDUVERSE-COLLABORATION-RELEASE.md](EDUVERSE-COLLABORATION-RELEASE.md) for Student/Mentor accounts, teams, the required database migration, setup and actual test results. The sections below retain the original feature documentation and some historical authentication notes; current signup/signin uses email and password.


A full-stack college quiz/assessment platform: React (Vite) frontend + Express
backend + Supabase (Postgres) database. Students join a quiz with a name,
register number and quiz password; answer MCQs against a server-authoritative
timer; and get an instant, auto-graded result. Admins create quizzes and
questions, publish/unpublish, watch a live monitor, and export results as CSV.

```
quiz-assessment-project/
├── frontend/   React + Vite (student portal + /admin/* admin portal)
├── backend/    Express REST API (talks to Supabase with the service-role key)
└── README.md   You are here
```

---

## 1. Features

**Student**
- Professional landing page with Eduverse info, plus Sign Up / Sign In
- Self-service account: Sign Up (username, 12-digit register number, strong
  password) and Sign In (register number + password) → Dashboard
- Quizzes page listing published quizzes, with search and status filters
- Join screen (name, register number, email, department, year, section, quiz password)
- MCQ quiz runner: question navigation palette, autosave per answer, server-side
  countdown timer, tab-switch/proctoring warnings, auto-submit on time-out or
  violation limit
- Instant result screen (score, percentage, correct/wrong/unanswered, pass/fail)
- Public leaderboard (optional per quiz)
- **Dashboard**: account overview and quick links (full feature set to be
  extended — see section 16)

**Admin** (`/admin`, login `admin@gmail.com` / `admin123` by default)
- Dashboard: total quizzes/students/submissions, average score, present/absent,
  recent submissions
- Quiz management: create, edit, delete, publish/unpublish, schedule
  start/end time, duration, passing %, max attempts, tab-switch limit,
  randomization, leaderboard visibility
- Question management: add/edit/delete MCQ, Programming, and Fill-in-the-Blank
  questions; multiple MCQ options with the correct one marked, per-question
  marks and negative marks
- **User Accounts / Guest Accounts**: every student who ever touched a quiz
  or account lives in one of these two tables (never both) — click any row
  to drill into full details and quiz history (see section 16)
- Participants: attendance and submission status per student, per quiz
- Attendance: join time / quiz-start time / submission time, present/absent
- Results: per-quiz table, summary stats (highest/average/pass %), CSV export
- Live monitor: joined / in-progress / submitted counts and a live ranking
  table, auto-refreshing every 5 seconds (polling, see note below)

> **Courses & Certificates have been completely removed** — frontend, admin
> UI, backend controllers/routes, config, dependencies, AND the database
> tables themselves. If your database ever ran the old
> `migration_courses.sql` / `migration_certificates.sql`, run
> `backend/sql/migration_drop_courses_and_certificates.sql` once in the
> Supabase SQL Editor to drop `courses`, `course_problems`,
> `course_problem_progress`, `pdf_imports` and `course_completions`. Nothing
> else in your database is touched by that file.

---

## 2. Tech stack

- **Frontend:** React 19 + Vite, React Router, Tailwind CSS, lucide-react icons
- **Backend:** Node.js + Express, JWT auth, bcrypt password hashing
- **Database:** Supabase (Postgres) accessed via `@supabase/supabase-js`,
  using the **service-role key from the backend only**
- **Security:** Row Level Security enabled on every table with **no**
  anon/authenticated policies — only this backend's service-role key can
  read or write. The frontend never talks to Supabase directly and never
  receives the service-role key.

---

## 3. Requirements

- Node.js 18+ and npm
- A free [Supabase](https://supabase.com) project
- **For programming questions** — the four language toolchains must be
  **pre-installed on the backend machine** (they are never downloaded at run
  time). See [section 15](#15-programming-judge--multi-language-execution).

| Language | Needs | Ubuntu/Debian | Windows | macOS |
|---|---|---|---|---|
| Python | `python3` | `sudo apt install python3` | python.org installer (tick "Add to PATH") | preinstalled / `brew install python` |
| C | `gcc` | `sudo apt install build-essential` | MSYS2/MinGW-w64 | `xcode-select --install` |
| C++ | `g++` | `sudo apt install build-essential` | MSYS2/MinGW-w64 | `xcode-select --install` |
| Java | JDK 17+ (`javac` **and** `java`) | `sudo apt install default-jdk` | Temurin/Oracle JDK | `brew install openjdk` |

Verify everything at once with `cd backend && npm run check:runtimes`.


---

## 4. Supabase setup

1. Create a project at supabase.com.
2. Go to **Project Settings → API** and copy:
   - Project URL
   - `anon` `public` key
   - `service_role` `secret` key (⚠️ server-only, never share or commit this)
3. Go to **SQL Editor**, paste the entire contents of
   `backend/sql/schema.sql`, and run it. This creates all tables, indexes,
   enables Row Level Security, and seeds the default admin account.

   > **Already have this project set up from before?** `schema.sql` is safe
   > to re-run on an existing database — it now also adds programming/coding
   > question support (`question_type`, `language`, `starter_code`,
   > `expected_output`, `reference_solution`, plus `code_answer` and
   > `marks_awarded` on `answers`) and Fill-in-the-Blank support
   > (`blank_answers`, `case_sensitive` on `questions`, `blank_answer` on
   > `answers`). Every column-add statement is idempotent, so your existing
   > quizzes, questions, and results are untouched.
   >
   > **If you previously ran an older copy of this file, re-run it anyway.**
   > The `question_type` check constraint is now dropped and recreated on
   > every run instead of being skipped when a constraint of that name
   > already exists — otherwise a database that had already picked up the
   > old `('mcq', 'coding')` constraint could never accept the new
   > `'fill_blank'` type, which is exactly what caused "Add Question" to
   > fail with a database error for anyone who'd already run schema.sql
   > once before this update.

> **If a service-role key was ever pasted anywhere insecure (chat,
> screenshots, a public repo), rotate it**: Project Settings → API →
> regenerate the `service_role` key, then update `backend/.env`.

4. **Existing database?** Also paste and run
   `backend/sql/migration_student_accounts.sql` (adds the `username` /
   `password_hash` columns on `students` that power Sign Up / Sign In). Not
   needed for a brand-new database — it's already included at the bottom of
   `schema.sql`. Idempotent and safe to re-run; nothing existing is touched.

5. **Existing database?** Also paste and run
   `backend/sql/migration_student_profile.sql` (adds `bio`, `avatar_url`, and
   `batch` on `students`, powering the Profile page's photo/bio editing and
   Sign Up / Profile's Batch field). Not needed for a brand-new database —
   it's already included at the bottom of `schema.sql`. Idempotent and safe
   to re-run.

> **Courses & Certificates have been completely removed**, including their
> database tables. `migration_courses.sql` and `migration_certificates.sql`
> no longer exist in this project. If you previously ran them on an existing
> database, run `backend/sql/migration_drop_courses_and_certificates.sql`
> once to drop `courses`, `course_problems`, `course_problem_progress`,
> `pdf_imports`, and `course_completions` — every other table is left alone.

---

## 5. Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key   # server only!
JWT_SECRET=<generate one, see below>
CORS_ORIGIN=http://localhost:5173
```

Generate a strong `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run it:
```bash
npm start        # production
npm run dev      # auto-restart on file changes
```

The API listens on `http://localhost:5000` by default. Check
`http://localhost:5000/api/health`.

---

## 6. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env
```

Edit `frontend/.env` if your backend isn't on the default URL:
```
VITE_API_URL=http://localhost:5000/api
```

Run it:
```bash
npm run dev       # http://localhost:5173
npm run build     # production build to frontend/dist
npm run preview   # preview the production build
```

---

## 7. Environment variables reference

| File | Variable | Where used | Secret? |
|---|---|---|---|
| `backend/.env` | `SUPABASE_URL` | backend only | no |
| `backend/.env` | `SUPABASE_ANON_KEY` | backend only (kept for completeness; the current design only uses the service-role key) | no |
| `backend/.env` | `SUPABASE_SERVICE_ROLE_KEY` | backend only | **yes — never expose to frontend** |
| `backend/.env` | `JWT_SECRET` | backend only | **yes** |
| `backend/.env` | `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` | backend only | password hash is sensitive |
| `frontend/.env` | `VITE_API_URL` | frontend (bundled into the client build) | no |

The frontend build never contains the Supabase URL/keys — it only knows the
backend's own API URL, and the backend is the only thing that talks to Supabase.

---

## 8. How to run everything locally

Two terminals:
```bash
# Terminal 1
cd backend && npm install && npm start

# Terminal 2
cd frontend && npm install && npm run dev
```
Open `http://localhost:5173`.

---

## 9. Admin login

- URL: `http://localhost:5173/admin/login`
- Email: `admin@gmail.com`
- Password: `admin123`

To change the password:
```bash
cd backend
npm run hash-password -- "yourNewPassword"
```
Copy the printed hash into `ADMIN_PASSWORD_HASH` in `backend/.env` and
restart the backend.

---

## 10. Student workflow

1. Open the site → pick a published quiz → **Join quiz**.
2. Enter name, register number, (optional) email/department/year/section, and
   the quiz password given by the instructor.
3. Answer MCQs; the countdown timer, question palette and autosave are all
   backed by the server, so refreshing the page resumes the same attempt and
   time budget.
4. Submit (manually, automatically at time-up, or automatically after too
   many tab switches) → instant result screen → optional leaderboard.

---

## 11. API documentation

Base URL: `http://localhost:5000/api`

### Admin (`Authorization: Bearer <admin token>` except login)
```
POST   /admin/login                              { email, password } -> { token, admin }
GET    /admin/dashboard                          stats + recent activity
GET    /admin/quizzes
POST   /admin/quizzes                            create quiz
GET    /admin/quizzes/:id
PUT    /admin/quizzes/:id                         update quiz (any subset of fields)
DELETE /admin/quizzes/:id
PATCH  /admin/quizzes/:id/status                  { status: draft|upcoming|live|completed }

GET    /admin/quizzes/:quizId/questions
POST   /admin/quizzes/:quizId/questions           MCQ:         { type: "mcq", text, marks, negativeMarks, options: [{text, isCorrect}] }
                                                    Programming: { type: "coding", text, marks, language, starterCode, expectedOutput, referenceSolution }
                                                    Fill-blank:  { type: "fill_blank", text, marks, blankAnswers: [["accepted", "answers"], ...], caseSensitive }
PUT    /admin/questions/:id
DELETE /admin/questions/:id
PUT    /admin/quizzes/:quizId/questions/reorder   { orderedIds: [...] }

GET    /admin/participants?quizId=&department=&year=&section=&search=
GET    /admin/attendance?quizId=&department=&year=&status=&date=
GET    /admin/results?quizId=
GET    /admin/results/:attemptId
GET    /admin/results/export?quizId=              CSV download
GET    /admin/live/:quizId                        live monitor snapshot

GET    /admin/students?search=&limit=&accountType=registered|guest
                                                   used by Admin -> User Accounts / Guest Accounts
GET    /admin/students/:id                        full profile + quiz history (the "click a row" detail view)
```

### Student
```
GET    /quizzes                                   public list (published only)
GET    /quizzes/:id                                public quiz metadata
POST   /students/login                             { quizId, name, registerNumber, quizPassword, ... } -> { token, student, quiz }
GET    /students/profile                           (student token, mid-quiz)

POST   /students/register                          { username, registerNumber, password, confirmPassword,
                                                       department, section, batch } -> { token, student }  (Sign Up)
POST   /students/signin                             { registerNumber, password } -> { token, student }
GET    /students/account                            (account token) -> current account's profile
PUT    /students/account                            (account token) any subset of { username, bio, avatarUrl,
                                                       department, section, batch } — registerNumber never accepted
PUT    /students/account/password                   (account token) { currentPassword, newPassword, confirmPassword }

POST   /quizzes/:id/start                           (student token) -> questions + timer
POST   /quizzes/:id/answer                          { questionId, optionId } -> autosave
POST   /quizzes/:id/violation                       -> log a tab-switch, may auto-submit
POST   /quizzes/:id/submit                          -> grade + finalize
GET    /quizzes/:id/result                          (student token) -> this student's result
GET    /quizzes/:id/leaderboard                     public, if quiz allows it
GET    /student/results                             (student token) -> all of this student's results
```

All responses are JSON: `{ success: boolean, ...payload }` on success, or
`{ success: false, message, details? }` on error.

---

## 12. Scope notes — decisions made to ship a working, coherent v1

- **MCQ, Programming, and Fill-in-the-Blank.** A real code-execution judge
  (for programming questions) is a separate large system and is out of
  scope here — programming submissions are graded safely without executing
  code (see `backend/src/utils/codeValidator.js`).
- **Single flat question list per quiz** (no separate "rounds" concept) — the
  schema and spec don't require multi-round structuring.
- **Live monitor uses polling** (every 5s), not WebSockets. Socket.IO/SSE
  would be a clean upgrade if you need sub-second updates — swap
  `AdminLive.jsx`'s `setInterval` and the `/admin/live/:quizId` endpoint for a
  socket room per quiz.
- **`quiz_attempts` doubles as the "results" table** — rather than a separate
  `results` table that could drift out of sync with attempts, one row per
  attempt holds both attempt state and the graded outcome. `/api/admin/results`
  reads straight from it.
- **RLS is deny-by-default everywhere.** Only the backend's service-role key
  can read/write. This is simpler and more auditable than writing per-role
  policies for a frontend that never talks to Supabase directly.
- **Dashboard charts** were simplified to real numeric stat cards rather than
  the trend/distribution charts in the original UI mockup, since those need
  extra time-series aggregation endpoints not in the current scope.
- **Admin "Settings" preferences** (email notifications, default toggles) are
  stored in the browser's `localStorage`, not the database — there's no
  `admin_preferences` table in this build. This is called out in the UI.

---

## 13. Troubleshooting

- **"Host not in allowlist" / can't reach Supabase:** your network/firewall
  is blocking `*.supabase.co`. Allow it, or double-check you copied the exact
  Project URL from Supabase settings.
- **Admin login fails with correct credentials:** confirm `ADMIN_EMAIL` /
  `ADMIN_PASSWORD_HASH` in `backend/.env` match what you expect, and that you
  restarted the backend after editing `.env`.
- **CORS errors in the browser console:** make sure `CORS_ORIGIN` in
  `backend/.env` matches the exact origin the frontend is served from
  (`http://localhost:5173` in dev).
- **"relation does not exist" errors:** you haven't run `backend/sql/schema.sql`
  in the Supabase SQL Editor yet.
- **Student can't join a quiz:** check the quiz's `status` isn't `draft`, and
  that the quiz password matches exactly (it's case-sensitive).

---

## 14. Deployment notes

- **Backend:** deploy anywhere that runs Node (Render, Railway, Fly.io, a VPS).
  Set the same environment variables as `backend/.env.example`, using your
  production Supabase project and a fresh `JWT_SECRET`. Set `CORS_ORIGIN` to
  your deployed frontend's URL.
- **Frontend:** `npm run build` produces a static `frontend/dist` folder —
  deploy it to Vercel, Netlify, or any static host, with `VITE_API_URL`
  pointing at your deployed backend.
- Rotate `JWT_SECRET` and the Supabase service-role key for production; don't
  reuse development secrets.

## 15. Programming judge — multi-language execution

Programming questions run real code (LeetCode/HackerRank style) in **Python,
Java, C and C++**.

**How a run is served**

1. `backend/src/utils/localRunner.js` compiles/executes on this server using
   the **pre-installed** toolchains. Discovery happens **once at boot**
   (`warmupRuntimes()` in `src/server.js`) — no runtime is ever installed,
   downloaded or bootstrapped while a student presses Run or Submit.
2. If a language is missing locally, `backend/src/utils/codeRunner.js` falls
   back to a Piston-compatible sandbox at `CODE_EXEC_URL`. Set
   `CODE_EXEC_PROVIDER=local` to disable that fallback entirely.

**Language details**

- **Python** — `python3` (or `python`), run with `-I -u` (isolated,
  unbuffered) so no site config or stale bytecode interferes.
- **C / C++** — `gcc` / `g++` (`cc`, `clang`, `clang++`,
  `x86_64-w64-mingw32-gcc/g++` and versioned `gcc-13`-style binaries are
  accepted too), compiled with `-O2` (`-std=c++17` for C++), linked with `-lm`
  for C. Discovery no longer relies on `PATH` alone: MSYS2 (`ucrt64`,
  `mingw64`, `clang64`), MinGW-w64, TDM-GCC, WinLibs, Cygwin, Strawberry Perl,
  LLVM, Chocolatey, Homebrew (`/opt/homebrew/bin`), `/usr/local/bin` and Nix
  (`/run/current-system/sw/bin`) are all probed at boot. If C/C++ still report
  `NOT INSTALLED`, install a compiler
  (`sudo apt install build-essential`, `brew install gcc`, or MSYS2
  `pacman -S mingw-w64-ucrt-x86_64-gcc` on Windows) or pin `GCC_BIN`/`GPP_BIN`
  in `backend/.env` — the server never installs anything on demand.
- **Java** — the source is parsed before compiling, so `public class Solution`,
  a non-public class or a `package a.b;` declaration all work: the file is
  written under the correct name/folder and the class that owns `main` is the
  one executed. `javac`/`java` are located via `PATH`, `JAVA_HOME`/`JDK_HOME`
  (root, `bin/`, `lib/openjdk/bin`, macOS `Contents/Home/bin` layouts),
  symlink-resolved PATH entries, and `/usr/lib/jvm`, `/opt/java`,
  `C:\Program Files\Java`, Eclipse Adoptium.

**Pin binaries explicitly** (optional, skips all lookup) in `backend/.env`:

```env
PYTHON_BIN=/usr/bin/python3
GCC_BIN=/usr/bin/gcc
GPP_BIN=/usr/bin/g++
JAVAC_BIN=/usr/lib/jvm/java-21-openjdk-amd64/bin/javac
JAVA_BIN=/usr/lib/jvm/java-21-openjdk-amd64/bin/java
```

**Programming tab (public playground)**

`/programming` in the student app is a standalone editor: pick Python, Java, C
or C++, write code, supply stdin and press **Run Code**. It calls
`POST /api/playground/run` (public, rate limited to 20 runs/min/IP, 64 KB
source, 16 KB stdin, 5 s wall clock) and streams back stdout, stderr,
compilation output and the execution status. `GET /api/playground/languages`
reports which toolchains this server has. The playground never reads or writes
quiz data, attempts, marks or hidden test cases.

**Run vs Submit**

- **Run** — executes with the student's own stdin, or against the *visible*
  sample cases. Never touches marks, never reveals hidden cases. The terminal
  panel shows stdin, compiler output, stdout, stderr and the verdict.
- **Submit** — executes against **all** test cases (hidden included) on the
  server; hidden inputs/expected outputs are redacted before the response is
  sent. Marks = passed cases × per-case marks, with negative marking applied.

**Timeouts** apply to the student's program only. Compilation (20 s) and
toolchain discovery (boot) have separate budgets, and each language has a
start-up floor (Java 6 s, Python 3 s, C/C++ 2 s) so JVM/interpreter boot never
counts as "Time Limit Exceeded".

**Isolation:** every run gets a fresh temp directory that is deleted
afterwards, children are spawned without a shell, with a minimal env (no DB
URL, no JWT secret, no keys), output capped at 20 KB, and the process group is
SIGKILLed on timeout.

**Self-check:**

```bash
cd backend
npm run check:runtimes
```

Prints the detected version of each toolchain and runs a real hello-world
program through it. Sample output:

```
✓ python  Python 3.13.12 (31 ms)
✓ c       gcc (GCC) 14.3.0 (4 ms)
✓ cpp     g++ (GCC) 14.3.0 (6 ms)
✓ java    javac 21.0.10 (152 ms)
```

**Judge troubleshooting**

| Symptom | Cause / fix |
|---|---|
| "… is not installed on this server" | The toolchain is genuinely missing — install it (table in section 3) or set the matching `*_BIN` path, then restart the backend. |
| Java works in a terminal but not in the app | The backend process has a different `PATH`. Set `JAVA_HOME` (or `JAVAC_BIN`/`JAVA_BIN`) in `backend/.env`. |
| "Downloading Python…" on Windows | A Microsoft Store alias stub. Install real Python from python.org; the judge already skips 0-byte `WindowsApps` stubs. |
| Time limit exceeded on a correct program | The program is waiting on stdin that was never provided, or the question's limit is too low. |
| `class Foo is public, should be declared in a file named Foo.java` | Fixed — update to this build; the file name is derived from the source. |

---

## 16. Student accounts, Landing page & Admin account management

This update adds a proper account layer on top of the existing student flow,
a professional Landing page, and admin-side account management — while
leaving every other feature (quizzes, programming/Playground, results, live
monitoring, all admin tools) untouched. Courses & Certificates have since
been completely removed (see the note in section 1).

**Landing page** (`/`): a marketing page with Eduverse info and Sign Up /
Sign In calls-to-action, replacing the old quiz-listing home. Quiz browsing
now lives at `/quizzes` (unchanged, just no longer doubling as the home page).

**Sign Up** (`/signup`): username, 12-digit register number, department,
section, batch, and a strong password (min. 8 characters with upper/
lower-case, a number, and a special character — enforced on both the client
and the server). Batch is an admission→graduation year range (e.g.
"2024–2028") picked from a dropdown that's driven by a study-duration select
(3/4/5 years) — never typed freely, and independent of the `year` field used
by the per-quiz guest join flow (e.g. "Second Year"). If the given register
number already has a `students` row (e.g. because the student previously
joined a quiz), the new account is attached to that same row so their
history is preserved, and the department/section/batch given at Sign Up
become authoritative; otherwise a fresh row is created.

**Sign In** (`/signin`): register number + password → `/dashboard`. This is
a separate, persistent session (`localStorage`, backed by a JWT) from the
per-quiz login at `/login/:quizId`. As of section 18 below, `/login/:quizId`
now requires this account session to be signed in first.

**Dashboard** (`/dashboard`, protected — redirects to `/signin` if signed
out): profile summary, avatar, and quick links to Quizzes/Programming/Profile.

**Profile** (`/profile`, protected): edit photo, bio, username, department,
section, and batch. Register Number is always fixed and can never be
changed from here (or anywhere in the API). A separate form on the same page
changes the password, requiring the current one. Department/section/batch
are optional to fill in here (unlike at Sign Up, where they're required) so
an account created before this feature existed isn't forced to complete them
just to update a bio or photo.

**Admin → User Accounts** (`/admin/user-accounts`) and **Admin → Guest
Accounts** (`/admin/guest-accounts`): every student who has ever touched a
quiz or an account lives in exactly one of these two tables, split by
whether `students.username` is set. User Accounts holds everyone who signed
up (username + password); Guest Accounts holds everyone who only ever
attended a quiz via the per-quiz login form without creating an account. If
a guest later signs up with the same register number, they move to User
Accounts automatically — nothing needs to be migrated by hand. Click any row
in either table to open a detail view with full profile info and quiz
history; this replaces the old standalone Admin → Search page and its search
bar, which have been removed (along with the decorative, non-functional
search box that used to sit next to the notification bell). Passwords are
never selected from the database by either table's endpoint, let alone
returned or displayed.

Run `backend/sql/migration_student_accounts.sql` and
`backend/sql/migration_student_profile.sql` on an existing database to add
the columns these need (already included in `schema.sql` for new databases)
— see section 4.

---

## 18. Landing Page Quizzes & mandatory sign-in to join

This update adds two things on top of section 16, without changing any
other existing feature (the normal Quizzes tab, quiz builder, grading,
results, live monitoring, etc. all work exactly as before):

**Landing Page Quizzes** (`Admin → Landing Quizzes`, `/admin/landing-quizzes`):
a separate tab, next to the normal Quizzes tab, for quizzes that should be
featured on the public Landing Page (`/`) instead of (or as well as) the
`/quizzes` browse page. It's the exact same quiz builder — questions,
rounds, settings, publishing — just tagged with a `placement` of `'landing'`
instead of `'quizzes'`. Landing quizzes never show up on `/quizzes`, and
normal quizzes never show up on the Landing Page. Published (`live` /
`upcoming`) landing quizzes appear in a "Landing Quiz" section on `/`; if
none exist yet, that section simply doesn't render.

Run `backend/sql/migration_landing_quizzes.sql` on an existing database to
add the `placement` column this needs (already included in `schema.sql` for
new databases) — see section 4. Until that migration is run, the API
returns a clear setup error naming the file to run (for admin endpoints) or
degrades gracefully (the public Landing Page section is simply empty, and
`/quizzes` shows everything as before).

**Sign Up / Sign In required to join any quiz**: `/login/:quizId` (the
per-quiz join form, for both normal and landing quizzes) is now gated
behind the same account session used by `/dashboard`. A student who isn't
signed in is redirected to `/signin`, with a "Sign up instead" link, and is
sent back to the quiz they were trying to join right after signing in or
signing up. Once signed in, the join form pre-fills Name and Register
Number from the account (still editable) — everything else about joining
(department/year/section/mobile/email, the quiz password, attendance,
attempt limits, grading) is unchanged.

---

## 19. Changelog highlights

### v9 changes



#### 1. First-visit Student Page tutorial
- `frontend/src/components/StudentTutorial.jsx` — 10-slide interactive overlay, one Student Page feature per slide.
- Navigation is Next → Next → Next; **Skip advances one slide** (it never closes the tour).
- The overlay stays up while `/quizzes` data loads; the final button shows a loading state until data is ready.
- Completion is stored in `localStorage` under `quizapp_student_tutorial_done_v1`, so it appears only on the first visit.
- Mounted from `frontend/src/pages/student/Landing.jsx`.

#### 2. Admin-configurable per-question time limit
- Admins set the limit per question in the Admin Portal (Add/Edit question -> "Time limit for this question"): a number plus a **Seconds / Minutes** unit. Empty or `0` means **no limit** for that question — only the overall quiz timer applies. Max 2 hours per question.
- Stored in `questions.time_limit_seconds` (`backend/sql/schema.sql`, added idempotently). Databases without the column keep working — `backend/src/utils/featureSupport.js` probes support (`questionTimeLimitSupported`).
- `backend/src/controllers/adminQuestionController.js` validates/normalizes the value and returns it as `timeLimitSeconds`; `backend/src/controllers/quizAttemptController.js` sends `timeLimitSeconds` with every question delivered to students (never the answer key).
- `frontend/src/pages/student/QuizRunner.jsx` applies that exact per-question value — the old fixed 60-second constant is removed. The countdown resets on each question change; on expiry the question is locked and the quiz auto-advances. Questions with no limit show no countdown at all.
- `frontend/src/components/QuestionTimer.jsx` renders `mm:ss` and scales its warning/critical colours to the configured limit.
- Expired questions cannot be answered (options/inputs disabled, answer handlers guarded) and show a clear notice.

#### 3. Skip = Next in the quiz
- The quiz footer has **Skip** next to **Next**. Both call the same handler: the current answer state is flushed/saved (debounced code and fill-in-the-blank answers included) and the quiz immediately moves to the next question.
- In the first-time tutorial overlay, **Skip** also simply advances one slide.

- The existing overall quiz timer, auto-submit, answer autosave, question palette and tab-switch proctoring are unchanged.

### v33 changes — multi-language execution fix

- Java toolchain discovery now also resolves symlinked `PATH` entries and the
  `JAVA_HOME` root / `lib/openjdk/bin` / macOS bundle layouts, so a JDK is found
  on Nix, sdkman, asdf, Homebrew, Adoptium and distro installs.
- Verified end to end for **Python, Java, C and C++**: stdin handling, correct
  output, compile errors, runtime errors, time-limit-exceeded, hidden-test
  grading (3/3) and hardcoded-answer rejection.
- Added the judge documentation above plus `npm run check:runtimes` guidance.


---

## AI-powered inclusive learning platform

The platform now includes an adaptive learning engine, AI Tutor (text + voice, English/Tamil),
content simplifier, accessibility center, personalised recommendations and a teacher
"Learning Insights" dashboard. **Run `backend/sql/migration_ai_learning.sql` once**, then see
[`AI-LEARNING-PLATFORM.md`](./AI-LEARNING-PLATFORM.md) for setup, how it works, security notes and limits.
