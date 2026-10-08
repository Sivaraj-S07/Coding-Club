-- ============================================================================
-- Email Sign Up / Sign In + forced Profile completion
--
-- Sign Up now collects only Username, Email, Password, Confirm Password.
-- Register Number and Mobile Number move to a forced Profile-completion step
-- right after Sign Up / Sign In (see updateAccount in
-- studentAccountController.js) — so `register_number` can no longer be
-- NOT NULL at the database level; it starts out empty and is set exactly
-- once, from Profile.
--
-- This does NOT affect the separate "join a quiz as a guest" flow (POST
-- /api/students/login), which still collects and requires a Register Number
-- up front, exactly as before — those rows simply always have one filled in
-- immediately, same as today.
--
-- Safe to re-run: every statement is idempotent, and no existing row's data
-- is dropped or overwritten.
-- ============================================================================

-- 1) Register Number becomes nullable. The existing format check constraint
--    (register_number ~ '^[0-9]{12}$') already permits NULL — Postgres CHECK
--    constraints only apply to non-null values — so it needs no change.
alter table students alter column register_number drop not null;

-- 2) Replace the implicit "unique" from the old `unique not null` column
--    definition with a partial unique index, exactly the same pattern
--    already used for `username` in migration_student_accounts.sql: unique
--    among rows that actually have a value, so newly-signed-up accounts with
--    no register number yet (however many of them) never collide.
alter table students drop constraint if exists students_register_number_key;
drop index if exists students_register_number_key;
drop index if exists idx_students_register_number_unique;
create unique index idx_students_register_number_unique
  on students (register_number)
  where register_number is not null;

-- The plain (non-unique) lookup index from the original schema is still
-- useful and is left as-is:
--   idx_students_register_number

-- 3) Email must be unique, case-insensitively, among rows that are actual
--    Sign-Up accounts (password_hash is set). Guest/quiz-only rows created
--    by joining a quiz (or bulk-imported by an admin) may have a blank or
--    duplicate email and are intentionally excluded from this check.
drop index if exists idx_students_email_unique;
create unique index idx_students_email_unique
  on students (lower(email))
  where email is not null and password_hash is not null;

-- 4) Defense-in-depth email format check (the API already validates this;
--    this mirrors the register_number/username pattern above). Applies to
--    any non-null email, account or not — NULL is always allowed.
alter table students drop constraint if exists students_email_format;
alter table students add constraint students_email_format
  check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
