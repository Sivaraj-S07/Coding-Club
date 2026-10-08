# Update: Simplified Sign Up + Forced Profile Completion, Onboarding Move, Compiler Hardening

## 1. Sign Up — Username, Email, Password, Confirm Password only
Sign Up (`/signup`) no longer asks for Register Number, Mobile Number, Department,
Section or Batch. It's now exactly four fields.

## 2. Sign In — Email + Password only
Sign In (`/signin`) now authenticates by Email + Password instead of Register
Number + Password.

## 3. Profile — forced completion after login
Everything Sign Up no longer collects (Register Number, Mobile Number, and
optionally Department/Section/Batch) is now collected on `/profile`, and a
student is **forced there** — every other student route redirects to
`/profile` — until Register Number and Mobile Number are both filled in.
Register Number can be set exactly once; after that it's permanently fixed,
same as before. If a student had already joined a quiz as a guest under that
register number before signing up, their quiz history is automatically
folded into the new account.

## 4. Onboarding tour moved
The "Next / Next / Next" welcome tour no longer appears on the Quizzes tab.
It now shows once, on the Landing Page, on a visitor's first visit.

## 5. Compilers hardened (C, C++, Java, Python)
The local judge (used whenever a compiler/interpreter is installed on the
server) previously ran student programs with a wall-clock timeout and output
cap but **no memory limit**. A submission that allocated memory in an
infinite loop (accidental or deliberate) could pressure the whole server
before the timeout ever fired. Fixed:
- C / C++ / Python runs are now wrapped with `ulimit -v` (768MB / 768MB /
  1GB), `ulimit -u` (64 processes) and `ulimit -f` (20MB file size) on
  Linux/macOS. Compilation itself is untouched — only the compiled/executed
  student program is capped.
- Java gets an explicit `-Xmx256m` heap cap instead (the JVM reserves large
  virtual address space regardless of usage, so `ulimit -v` would prevent it
  from starting at all — verified this directly).
- Verified end-to-end against the real judge module: normal C/C++/Python/Java
  programs, stdin-based programs, and legitimately memory-heavier (but
  reasonable) programs all still run correctly; a genuine memory-runaway
  program is now stopped gracefully instead of risking the host.
- No change on Windows (no `ulimit` equivalent there) — the existing
  wall-clock timeout and output cap remain the primary defense on that
  platform, same as before this update.

## Database migration required
Run **`backend/sql/migration_email_signup.sql`** once in Supabase (it's also
folded into `schema.sql` for fresh installs). It:
- Makes `register_number` nullable (was `NOT NULL UNIQUE`), replacing the
  unique constraint with a partial unique index (unique only among rows that
  have a value) — the same pattern already used for `username`.
- Adds a case-insensitive unique index on `email`, scoped to rows that are
  actual Sign-Up accounts (`password_hash is not null`) — guest/quiz-only
  rows are unaffected.
- Adds a defense-in-depth email format check constraint.

This does **not** touch the separate "join a quiz as a guest" flow, which
still collects and requires a Register Number immediately, exactly as
before.

## Verification performed
- `node --check` across every backend file (all pass).
- Frontend: clean `npm install`, clean `vite build`, and `oxlint` (zero
  errors/warnings in any file touched by this update — the only lint errors
  present are pre-existing and live entirely inside `node_modules`,
  unrelated to this change).
- Local judge changes tested directly against the real module with gcc/g++/
  python3 installed: normal programs, stdin programs, legitimate
  moderate-memory programs, a genuine memory-runaway program, and an
  infinite-loop timeout — all behave correctly.
- Not tested against a live Supabase database or a live Java JDK (neither
  was available in the build sandbox); the SQL is idempotent and was
  reviewed statement-by-statement against the existing schema conventions.
