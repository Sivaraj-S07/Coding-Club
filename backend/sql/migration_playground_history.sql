-- ============================================================================
-- Playground (Programming tab) history
--
-- The standalone Playground has always been public and stateless — it never
-- touched the database. This adds durable, per-student storage for it so a
-- signed-in student's practice runs show up on their Dashboard ("Programming
-- practice") and an admin can review them for that student.
--
-- The Playground itself stays usable without signing in: a run is only ever
-- saved when the request carried a valid student account token (see
-- optionalStudentAuth in backend/src/middleware/auth.js) — an anonymous
-- visitor's runs are never written anywhere.
--
-- Safe to re-run: `create table if not exists` / `create index if not
-- exists`, no existing data touched.
-- ============================================================================
create table if not exists playground_runs (
  id uuid primary key default gen_random_uuid(),
  -- Nullable and ON DELETE CASCADE: deleting a student account (see
  -- adminStudentController.deleteStudent) automatically removes every run
  -- they saved — no orphaned rows, no separate cleanup step needed.
  student_id uuid references students (id) on delete cascade,
  language text not null,
  source text not null,
  stdin text not null default '',
  status text not null,
  stdout text not null default '',
  stderr text not null default '',
  compile_output text not null default '',
  time_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_playground_runs_student
  on playground_runs (student_id, created_at desc);

-- Same project-wide convention as every other table (see the note above
-- `alter table students enable row level security` in schema.sql): RLS is
-- enabled with NO policies. All real access control happens in the Express
-- backend (requireStudent / requireAdmin + explicit student_id scoping) —
-- this is only a backstop in case the anon/publishable key ever leaked.
alter table playground_runs enable row level security;
