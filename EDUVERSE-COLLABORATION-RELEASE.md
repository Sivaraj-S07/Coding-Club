# Eduverse collaboration release

## What's new
- Refined shared UI: Manrope headings, DM Sans body text, restrained dark surfaces, consistent buttons, inputs, borders, cards and navigation. Existing accessibility font overrides and programming monospace remain available.
- Student/Mentor account selector in existing signup and signin screens. Students retain email/password authentication and required profile completion; mentors have separate password-hashed accounts and role-specific JWTs.
- Teams section in the student dashboard and `/teams` collaboration hub. Search registered students, mentors and teams; create teams; request membership; send invitations; accept/reject invitations and owner-reviewed join requests.
- Team owners invite/remove students and mentors. Owners delete teams; other members leave. Only accepted mentors can view current team members' read-only learning overview (XP/streak, topic progress, quiz results, shared projects, programming source/output, adaptive activities).
- Team mentor chat, mentor-assigned tasks, student-controlled task statuses, and shared project links. Chat refreshes every five seconds while visible; use Refresh teams to reload other updates.
- All team writes use an atomic PostgreSQL function with per-team locking. Browsers cannot execute this function directly. Authorization comes from verified account tokens, not user-supplied actor identifiers. Mentor overview membership is checked again before returning data.
- Existing student profile fields, quiz guest accounts, admins, AI tutor, adaptive learning, coding editors and import/export compatibility are retained.

## Required setup
This ZIP contains the complete source, not a preconfigured hosted service. Install dependencies and configure your own services before running.

1. Follow `README.md`, `EDUVERSE-UPDATE.md`, `UPDATE-EMAIL-AUTH-AND-COMPILERS.md`, and `backend/README-judge.md` for the existing application setup. For a new database, apply `backend/sql/schema.sql`; apply existing migrations required by your installation as instructed in those documents. Keep a backup before updating an existing database.
2. **Apply `backend/sql/migration_teams_mentors.sql` last in your Supabase SQL Editor.** It adds mentor/team tables and the service-role-only atomic action function without deleting existing student/quiz data. The migration is safe to re-run. It requires the existing student account columns (`password_hash`, `username`). Mentor learning views also require the existing AI learning and playground history schemas.
3. Copy `backend/.env.example` to `backend/.env`; set your Supabase URL and service-role key, a strong JWT secret, production admin password hash, CORS origin, and optional AI provider settings. Never expose the service-role key in frontend configuration. Default development admin/JWT credentials must be replaced before deployment.
4. Copy `frontend/.env.example` to `frontend/.env`; set `VITE_API_URL` to the backend API URL.
5. Install packages in both `backend` and `frontend` (`npm ci`, or Bun with the included lockfiles). Start the backend with `npm start` and frontend with `npm run dev`. Build frontend with `npm run build` for deployment. Configure SPA fallback for routes such as `/teams` and `/mentor/dashboard`.
6. Install the Java/C/C++/Python toolchains or configure an isolated remote judge. Local resource limits are **not** a security sandbox: run untrusted code only in a nonprivileged, isolated judge deployment.

## Collaboration walkthrough
1. Student signs up and completes the existing profile form. Open Dashboard → Teams, create a team, and search Students or Mentors to invite them to an owned team. Other students find teams and request to join; team owners approve/reject requests under Discover & invitations.
2. Mentor chooses Mentor on signup/signin. The mentor workspace lists incoming invitations; accepting an invitation grants team access. Rejecting does not grant access.
3. Select an accepted team → Members → View dashboard for a student's read-only progress. Open Mentor chat to communicate and Tasks to assign a task to a current student member. Students update their own task statuses and share project links in Projects.
4. Owners can remove mentors to revoke access; student members can leave to stop sharing their learning data with that team's mentors. Owners can delete the entire team. Existing chat/tasks/projects remain team records while the team exists. Removing a mentor prevents subsequent authorized requests; it cannot erase data already viewed/downloaded. Owner invitations share current team members' learning data when accepted; this disclosure is shown in the hub.

## Verification performed
- Backend: **108 tests passed, 0 failed, 0 skipped**, including 10 new API tests and one multi-step real PostgreSQL integration test. Java, C, C++ and Python compiler regressions ran with local toolchains.
- PostgreSQL: fresh existing schema + team migration succeeded; migration rerun succeeded. Disposable-database integration covered creation, owner membership, join requests, student invitations, mentor rejection/acceptance, duplicate pending invites, wrong-actor denial, outsider denial, task assignment/status permissions, chat/projects, unsafe URL denial, leave, mentor removal, team deletion cascade and restricted RPC execution.
- API tests covered mentor signup/signin and password hashing, account-role checks, missing/deleted accounts, profile-field preservation, mentor/current-member read access, missing migration errors, search filter validation, verified actor identity and action validation.
- Frontend: **17 tests passed**; production build passed; lint reported **0 errors and 31 warnings**. Warnings remain React hook/optimization advisories; they are not represented as resolved.
- Browser: both roles' signup/signin, team creation, mentor search/invite/accept, chat, project sharing, mentor overview, mentor task assignment, student completion status and mobile no-horizontal-overflow checks passed with no uncaught page errors.
- Existing browser regressions: logo/title, editor fullscreen/caret preservation, four-language switching and tutor Stop/retry passed.

## Honest validation limits
Browser API responses were intercepted test fixtures; API unit tests used an in-memory database; the atomic team lifecycle ran against a real disposable local PostgreSQL database. No production user data was accessed. The complete live browser → Express → hosted Supabase chain, hosted service settings, realtime concurrent clients, live external AI providers, email delivery and every existing admin/quiz/media deployment flow were **not** end-to-end verified. There is no password recovery/email-verification feature added by this release. This tested source release is not a guarantee of an error-free deployment.

Before release on your server, run a real two-student/one-mentor signup and collaboration walkthrough with your configured services, verify each access-revocation case, and smoke-test existing quizzes, admin, profiles, media, accessibility/voice, tutor and coding platforms. A missing migration produces an actionable setup error rather than silently disabling authorization.

## Re-running tests
- Backend: `npm test` (compiler tests skip languages unavailable on your host; verify skip counts).
- Frontend: `npm test`, `npm run lint`, `npm run build`.
- Optional database integration: create a **disposable** PostgreSQL database, create `anon`, `authenticated` and `service_role` roles if absent, apply `schema.sql` then `migration_teams_mentors.sql`, set normal `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` variables, then run `EDUVERSE_TEST_PG=1 node --test tests/teams-postgres.test.js` from backend. The integration fixture is rolled back; never point tests at your production database. Without the opt-in flag, this one integration test is skipped.

## Archive
Source, SQL, logo-derived assets, tests, documentation, package manifests, lockfiles and environment templates are included. Dependencies, generated builds, Git metadata, real environment files, browser fixtures/screenshots and temporary artifacts are excluded. Read this file first; earlier documentation contains historical release notes.
