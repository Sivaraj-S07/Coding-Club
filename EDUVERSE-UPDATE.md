# Eduverse update and verification

## Included updates
- Rebranded the supplied existing React/Vite + Express project to Eduverse using the uploaded logo in the shared navbar/logo component, main logo asset, favicon, touch icon, page title, metadata, app copy, and documentation.
- New quiz exports use the Eduverse identifier. Existing Coding Club quiz exports remain importable through a read-only legacy format identifier; removing that identifier would break existing files.
- AI Tutor has a Stop button, browser/unmount cancellation, server disconnect cancellation, and cancellation propagated to the external model. Cancellation does not activate provider-outage cooldown.
- Conversation context is retained instead of silently dropping older turns. Excessive history is explicitly rejected at the server's 60,000-character ceiling. Offline follow-ups can resolve the prior lesson topic.
- Provider instructions request the actual programming language, syntax/edge-case/output checking, honest uncertainty, and no unsupported claims of code execution. This improves guidance but does not guarantee model accuracy.
- Local grading compiles once per submission rather than once per test case. Compiled artifacts are copied to a fresh run directory per case, so student-created files do not leak between cases. No cache is shared between students.
- Java helper files are forwarded to configured Piston execution. Local Java retains a bounded heap and uses a smaller thread stack. The POSIX process-limit backstop accommodates existing service/JVM threads, fixing Java startup failures reproduced during testing.
- Program/compiler output uses streaming UTF-8 decoding, preventing corrupted Tamil/emoji output when bytes arrive in separate chunks.
- Editor fullscreen transitions retain the selection and scroll position; IME composition is not interrupted by custom key handling.
- Playground draft persistence is debounced while typing and flushed on page exit/unmount. Existing saved-program behavior and browser storage identifiers are retained.
- Added compiler and cancellation regression tests and scoped frontend lint to application code rather than installed third-party dependencies.

## Verification performed
- Backend automated tests: **97 passed, 0 failed, 0 skipped**, with gcc, g++, Python 3, and OpenJDK 21 available.
- Frontend quiz/PDF tests: **17 passed, 0 failed**.
- Backend syntax: **75 JavaScript files passed**.
- Frontend production build: **passed**.
- Frontend lint: **0 errors, 29 existing warnings**. These are not represented as fixed; they include pre-existing React optimization/hook advisories.
- Browser regression checks: Eduverse title/logo, fullscreen selection preservation, Java/C/C++/Python language switching, tutor Stop and retry, and no uncaught page errors in those flows.
- Browser API responses were test fixtures. Backend AI tests used mocked providers and a fake database. No real student account or production data was used.
- Compiler regression coverage: stdin/output for all four languages, multiple graded cases, compilation artifact cleanup, fresh filesystems between cases, Java named public class and helper source, C compilation errors, Python Unicode output, timeout, and cancellation.

## Validation limits and production setup
This is a tested source release, not a guarantee that every deployed feature is error-free. Live database-backed account/admin/quiz/media flows and live Anthropic/Gemini/Piston/Wandbox integrations were not end-to-end tested because the deployment credentials and services were not configured. Retained tests cover quiz transfer compatibility, tutor guardrails, adaptive learning, and other existing behaviors, but do not exhaust every screen or deployment environment.

Use the existing README and backend/README-judge.md for full setup:
1. Copy backend/.env.example to backend/.env and set your own Supabase, JWT, admin, CORS, and optional AI settings. Keep real environment files out of source archives.
2. Apply the included SQL schema/migrations to your own database as instructed in README.md.
3. Copy frontend/.env.example to frontend/.env and set VITE_API_URL for your backend.
4. Install dependencies in frontend and backend (`npm ci` or the existing Bun workflow).
5. Install gcc, g++, Python 3, and a JDK before starting a local judge, then run `npm run check:runtimes` in backend.
6. Run backend with `npm start`; run frontend with `npm run dev` for development or `npm run build` for deployment.
7. Run `npm test` in both folders and `npm run lint` in frontend. Compiler tests explicitly skip unavailable languages, so check skipped counts on your deployment host.
8. Complete live sign-in, account/profile, admin, quiz, results, PDF import/export, gallery/media, adaptive learning, accessibility/voice, and external-provider smoke checks with your configured services before release.

**Security:** Local process resource limits are not a container or an OS security sandbox and do not prohibit all filesystem/network access. Execute untrusted student code only on a dedicated, nonprivileged, isolated judge host/container; use the existing remote-sandbox deployment option where appropriate. Do not expose the backend's default development JWT/admin credentials in production. Existing documentation has historical notes; this verification section describes what was actually tested for this update.

## Archive contents
Includes source, tests, lockfiles, supplied-logo-derived assets, environment templates, SQL, existing features, and deployment/documentation files. Real .env files, Git metadata, node_modules, generated dist/build files, and temporary test artifacts are excluded. Install dependencies and build for your target environment.
