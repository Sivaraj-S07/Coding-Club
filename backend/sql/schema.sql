-- ============================================================================
-- College Quiz & Assessment Management System — Supabase schema
-- Run this whole file once in the Supabase SQL Editor (Project > SQL Editor).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- admins
-- The app currently authenticates a single admin via backend/.env
-- (ADMIN_EMAIL / ADMIN_PASSWORD_HASH). This table exists so the schema is
-- ready to support multiple admin accounts later without a migration.
-- ----------------------------------------------------------------------------
create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  name text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- students (participants)
-- One row per person; the same student can attempt many quizzes.
-- ----------------------------------------------------------------------------
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  register_number text not null unique,
  email text,
  mobile_number text,
  department text,
  year text,
  section text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_students_register_number on students (register_number);

-- ----------------------------------------------------------------------------
-- quizzes
-- ----------------------------------------------------------------------------
create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  password_hash text not null,
  duration_minutes integer not null default 30,
  start_time timestamptz,
  end_time timestamptz,
  max_marks numeric not null default 0,
  passing_percentage numeric not null default 40,
  max_attempts integer not null default 1,
  randomize_questions boolean not null default true,
  randomize_options boolean not null default true,
  auto_submit boolean not null default true,
  allow_late_join boolean not null default false,
  show_leaderboard boolean not null default true,
  tab_switch_limit integer not null default 3,
  status text not null default 'draft'
    check (status in ('draft', 'upcoming', 'live', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quizzes_status on quizzes (status);

-- ----------------------------------------------------------------------------
-- questions (MCQ or programming/coding — see question_type below)
-- ----------------------------------------------------------------------------
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes (id) on delete cascade,
  question_text text not null,
  marks numeric not null default 1,
  negative_marks numeric not null default 0,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_questions_quiz_id on questions (quiz_id);

-- ----------------------------------------------------------------------------
-- quiz_options
-- ----------------------------------------------------------------------------
create table if not exists quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions (id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  order_index integer not null default 0
);

create index if not exists idx_quiz_options_question_id on quiz_options (question_id);

-- ----------------------------------------------------------------------------
-- quiz_attempts
-- ----------------------------------------------------------------------------
create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes (id) on delete cascade,
  student_id uuid not null references students (id) on delete cascade,
  attempt_number integer not null default 1,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'auto_submitted')),
  question_order jsonb,           -- ordered array of question ids shown to this student
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  violations_count integer not null default 0,
  total_marks numeric,
  obtained_marks numeric,
  correct_count integer,
  wrong_count integer,
  unanswered_count integer,
  percentage numeric,
  passed boolean,
  created_at timestamptz not null default now(),
  unique (quiz_id, student_id, attempt_number)
);

create index if not exists idx_quiz_attempts_quiz_id on quiz_attempts (quiz_id);
create index if not exists idx_quiz_attempts_student_id on quiz_attempts (student_id);
create index if not exists idx_quiz_attempts_status on quiz_attempts (status);

-- ----------------------------------------------------------------------------
-- student_logout_events
-- Records why a student's quiz attempt was force-ended (e.g. exceeding the
-- proctoring tab-switch/violation limit auto-submitted the attempt and
-- signed the student out of the quiz). Shown back to the student on their
-- Dashboard.
-- ----------------------------------------------------------------------------
create table if not exists student_logout_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  quiz_id uuid references quizzes(id) on delete set null,
  quiz_title text,
  reason text not null,
  message text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_logout_events_student on student_logout_events (student_id, created_at desc);

-- ----------------------------------------------------------------------------
-- answers
-- ----------------------------------------------------------------------------
create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references quiz_attempts (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  selected_option_id uuid references quiz_options (id) on delete set null,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index if not exists idx_answers_attempt_id on answers (attempt_id);

-- ----------------------------------------------------------------------------
-- Programming / coding questions support, plus Fill-in-the-Blank questions.
-- Safe to re-run on an already-created database — every statement below is
-- idempotent (add-if-missing / drop-then-recreate), so existing question
-- data and rows are always untouched.
-- ----------------------------------------------------------------------------
alter table questions add column if not exists question_type text not null default 'mcq';
alter table questions add column if not exists language text;
alter table questions add column if not exists starter_code text;
alter table questions add column if not exists expected_output text;
alter table questions add column if not exists reference_solution text;

-- Fill-in-the-Blank support: one row's worth of blanks, each blank holding
-- its list of accepted answers, e.g. [["paris"], ["france", "french republic"]].
alter table questions add column if not exists blank_answers jsonb;
alter table questions add column if not exists case_sensitive boolean not null default false;

-- IMPORTANT: constraints are dropped and recreated unconditionally on every
-- run (not merely "create if missing"). A previous version of this schema
-- guarded these with `if not exists (select ... from pg_constraint)`, which
-- meant that once the constraint existed with the OLD, narrower definition
-- (question_type in ('mcq', 'coding')), re-running the file could never
-- widen it — every attempt to add a 'fill_blank' question kept failing the
-- stale check constraint even after the application code and this file were
-- updated to support it. Dropping and recreating avoids that trap for any
-- future question-type additions too.
alter table questions drop constraint if exists questions_question_type_check;
alter table questions add constraint questions_question_type_check
  check (question_type in ('mcq', 'coding', 'fill_blank'));

alter table questions drop constraint if exists questions_language_check;
alter table questions add constraint questions_language_check
  check (language is null or language in ('c', 'cpp', 'java', 'python'));

-- A student's submitted source code for a programming question, plus the
-- marks this specific answer was awarded (populated at grading time).
alter table answers add column if not exists code_answer text;
alter table answers add column if not exists marks_awarded numeric;

-- A student's submitted fill-in-the-blank answers, stored as a JSON array of
-- strings (one per blank, in order) so multi-blank questions grade cleanly.
alter table answers add column if not exists blank_answer jsonb;

-- The original `answers.selected_option_id` FK is only meaningful for MCQ
-- questions; it stays nullable and simply unused for coding answers.

-- ----------------------------------------------------------------------------
-- rounds
-- A quiz can be split into multiple rounds (e.g. "Round 1 — Aptitude",
-- "Round 2 — Coding"). Every question optionally belongs to one round; a
-- question with round_id = null simply lives in the quiz's "Unassigned" bucket
-- so existing quizzes created before rounds existed keep working untouched.
-- ----------------------------------------------------------------------------
create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes (id) on delete cascade,
  name text not null,
  description text,
  order_index integer not null default 0,
  qualification_percentage numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Existing databases created before these columns existed:
alter table rounds add column if not exists qualification_percentage numeric not null default 0;
alter table rounds add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_rounds_quiz_id on rounds (quiz_id);

-- Deleting a round keeps its questions (they fall back to "Unassigned").
alter table questions add column if not exists round_id uuid references rounds (id) on delete set null;
create index if not exists idx_questions_round_id on questions (round_id);

-- ----------------------------------------------------------------------------
-- attendance
-- ----------------------------------------------------------------------------
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes (id) on delete cascade,
  student_id uuid not null references students (id) on delete cascade,
  attempt_id uuid references quiz_attempts (id) on delete set null,
  join_time timestamptz not null default now(),
  quiz_start_time timestamptz,
  submission_time timestamptz,
  status text not null default 'present' check (status in ('present', 'absent')),
  completed boolean not null default false,
  unique (quiz_id, student_id)
);

create index if not exists idx_attendance_quiz_id on attendance (quiz_id);
create index if not exists idx_attendance_student_id on attendance (student_id);

-- ============================================================================
-- Row Level Security — deny-by-default.
--
-- This backend's Express API is the ONLY thing that talks to Supabase, and it
-- always uses the SERVICE ROLE key, which bypasses RLS entirely. The frontend
-- never receives the service-role key and never queries Supabase directly.
-- So: enable RLS everywhere, add NO policies for anon/authenticated. This
-- means even if the anon/publishable key ever leaked, it could read or write
-- nothing.
-- ============================================================================
alter table admins enable row level security;
alter table students enable row level security;
alter table quizzes enable row level security;
alter table questions enable row level security;
alter table quiz_options enable row level security;
alter table quiz_attempts enable row level security;
alter table answers enable row level security;
alter table attendance enable row level security;
alter table rounds enable row level security;

-- Seed the default admin (email: admin@gmail.com / password: admin123).
-- Change the password later with: cd backend && npm run hash-password -- "newPassword"
-- then update this row (or just rely on backend/.env, which the API checks first).
insert into admins (email, password_hash, name)
values (
  'admin@gmail.com',
  '$2a$10$Bf.2j0TfLkAgf9hgRohNPeEGvz1LYHvvMl65mvjbetZtt2GdafV9u',
  'Administrator'
)
on conflict (email) do nothing;

-- Per-question time limit (in seconds). NULL / 0 means "no limit for this
-- question" — the student is then only bound by the overall quiz duration.
-- Admins set this per question in the Admin Portal (seconds or minutes).
alter table questions add column if not exists time_limit_seconds integer;

-- ----------------------------------------------------------------------------
-- Server-authoritative per-question timing (v12 quiz-system fix)
--
-- One row per (attempt, question). The row is created the first time the
-- question becomes active for that attempt and is NEVER reset — refreshing the
-- page, reopening the tab or replaying the API simply reads the same
-- started_at / expires_at, so the countdown cannot be restarted from the
-- browser. The backend rejects answers for questions whose expires_at passed.
-- ----------------------------------------------------------------------------
create table if not exists question_timings (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references quiz_attempts (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  expired boolean not null default false,
  unique (attempt_id, question_id)
);

create index if not exists idx_question_timings_attempt_id on question_timings (attempt_id);

-- Last question the student was on — restored after a refresh.
alter table quiz_attempts add column if not exists current_question_index integer not null default 0;

-- ============================================================================
-- v22 — Round qualification, per-notification read state
-- ============================================================================

-- Minimum percentage of a round a student must score to unlock the next round.
-- 0 (default) means "no qualification gate" — every existing quiz keeps working.
alter table rounds add column if not exists qualification_percentage numeric not null default 0;

-- Per-admin read state for the notification feed. The feed itself is derived
-- from recent activity (submissions / quizzes), so only the read marker needs
-- to be persisted — that is what makes the red unread dot disappear for good
-- once the admin has actually seen a notification.
create table if not exists admin_notification_reads (
  id uuid primary key default gen_random_uuid(),
  admin_key text not null default 'admin',
  notification_id text not null,
  read_at timestamptz not null default now(),
  unique (admin_key, notification_id)
);

create index if not exists idx_admin_notification_reads_key on admin_notification_reads (admin_key);

alter table admin_notification_reads enable row level security;

-- ============================================================================
-- Programming questions (LeetCode / HackerRank style) + negative marking for
-- every question type.
--
-- Safe to run on an existing database — every statement is idempotent and no
-- existing column or row is modified or dropped.
-- Run this in the Supabase SQL Editor (it is also appended to schema.sql).
-- ============================================================================

-- Rich problem definition for coding questions -------------------------------
alter table questions add column if not exists problem_statement text;
alter table questions add column if not exists input_format text;
alter table questions add column if not exists output_format text;
alter table questions add column if not exists constraints_text text;

-- Sample (visible) I/O shown to the student:
--   [{ "input": "3 4", "output": "7", "explanation": "3 + 4" }]
alter table questions add column if not exists sample_io jsonb not null default '[]'::jsonb;

-- Hidden test cases used for grading. NEVER sent to the client:
--   [{ "input": "3 4", "expectedOutput": "7", "hidden": true }]
alter table questions add column if not exists test_cases jsonb not null default '[]'::jsonb;

-- Per-execution CPU/wall time limit in milliseconds.
alter table questions add column if not exists time_limit_ms integer not null default 3000;

-- Languages the student may choose from, e.g. ["python","cpp"].
-- Empty array = fall back to the single `language` column.
alter table questions add column if not exists allowed_languages jsonb not null default '[]'::jsonb;

-- Judge verdict for a submitted coding answer:
--   { "status": "ok", "passed": 8, "total": 10, "ratio": 0.8, "language": "python" }
alter table answers add column if not exists judge_result jsonb;

-- The language the student actually submitted in.
alter table answers add column if not exists language text;

-- Negative marking now applies to coding and fill-in-the-blank questions too.
-- The column already exists for MCQ; this only guarantees it is present.
alter table questions add column if not exists negative_marks numeric not null default 0;

-- ============================================================================
-- Student self-service accounts (Sign Up / Sign In -> Dashboard)
--
-- A student row already exists once someone joins a quiz (see `joinQuiz`),
-- keyed by their unique 12-digit register_number. This adds an optional
-- account layer on top of that SAME row: a username + a hashed password, so
-- a student can sign up once and sign back in later (Register Number +
-- Password) to reach the Dashboard, without affecting quiz-join, quiz-taking
-- or any other existing flow. Both new columns are nullable — every
-- pre-existing student row keeps working exactly as before (they simply
-- have no account until they sign up).
--
-- Safe to re-run: every statement is idempotent and no existing column or
-- row is modified or dropped.
-- ============================================================================
alter table students add column if not exists username text;
alter table students add column if not exists password_hash text;
alter table students add column if not exists account_created_at timestamptz;

-- Usernames are unique, case-insensitively, but only enforced among rows
-- that actually have one (partial index) — students who joined a quiz but
-- never signed up for an account keep username = null indefinitely.
drop index if exists idx_students_username_unique;
create unique index idx_students_username_unique on students (lower(username)) where username is not null;

-- Register numbers must always be exactly 12 digits. This mirrors validation
-- already enforced in the API (quiz join + sign up) as a defense-in-depth
-- database constraint. Dropped and recreated unconditionally so a future
-- widening of the rule is never blocked by a stale constraint definition
-- (see the question_type constraint above for why this pattern is used).
alter table students drop constraint if exists students_register_number_format;
alter table students add constraint students_register_number_format
  check (register_number ~ '^[0-9]{12}$');

-- ============================================================================
-- Landing Page Quizzes
--
-- Adds a `placement` column to `quizzes` so a quiz can be shown either on the
-- normal Quizzes tab ('quizzes', the default — every existing row gets this
-- value automatically) or on the public Landing Page ('landing'), managed
-- from its own tab in the Admin Portal. Both placements reuse the exact same
-- quiz builder, join flow and grading — this only changes WHERE a quiz is
-- listed for students to find it.
--
-- Safe to re-run: idempotent, adds one column + one constraint + one index,
-- never drops or modifies existing data.
-- ============================================================================
alter table quizzes add column if not exists placement text not null default 'quizzes';

alter table quizzes drop constraint if exists quizzes_placement_check;
alter table quizzes add constraint quizzes_placement_check
  check (placement in ('quizzes', 'landing'));

create index if not exists idx_quizzes_placement on quizzes (placement);

-- ============================================================================
-- Student self-service Profile (edit photo / bio / username / password)
--
-- Adds two nullable columns so a signed-in student can personalize their
-- account from the Profile page. Register Number is intentionally never
-- part of this feature — it remains fixed for every student.
--
-- Safe to re-run: idempotent, only adds columns, never drops or modifies data.
-- ============================================================================
alter table students add column if not exists bio text;
alter table students add column if not exists avatar_url text;
-- Sign Up / Profile "Batch": admission→graduation year range, e.g.
-- "2024-2028" — independent of `year` (guest quiz-join's current year of
-- study) and `department`/`section` (already existed, shared by both flows).
alter table students add column if not exists batch text;

-- ============================================================================
-- Landing Page Media (Admin -> Landing Media)
--
-- Images/videos an admin uploads (Admin -> Landing Media) that appear in a
-- gallery section on the public Landing Page. Files themselves live in
-- Supabase Storage (bucket `landing-media`, created automatically by the
-- backend on first upload) — this table only stores metadata + public URL.
--
-- Safe to re-run: idempotent, only creates the table/index if missing.
-- ============================================================================
create table if not exists landing_media (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('image', 'video')),
  title text,
  caption text,
  storage_path text not null,
  url text not null,
  mime_type text,
  file_size_bytes bigint,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_landing_media_active_order
  on landing_media (is_active, sort_order);

alter table landing_media enable row level security;

-- ============================================================================
-- Maximum Attempt + Resume Quiz system: one active quiz session per
-- Register Number (see backend/sql/migration_quiz_session_lock.sql for the
-- full explanation). Safe to re-run: only adds columns/an index, never
-- drops or modifies data.
-- ============================================================================
alter table students add column if not exists active_session_token text;
alter table students add column if not exists active_session_quiz_id uuid references quizzes(id) on delete set null;
alter table students add column if not exists active_session_started_at timestamptz;

create index if not exists idx_students_active_session
  on students (active_session_token)
  where active_session_token is not null;

-- ============================================================================
-- Email Sign Up / Sign In + forced Profile completion
-- (see backend/sql/migration_email_signup.sql for the full explanation)
--
-- Sign Up now collects only Username, Email, Password, Confirm Password.
-- Register Number and Mobile Number are collected afterwards, during a
-- forced Profile-completion step, so register_number can no longer be
-- NOT NULL — it starts empty and is set exactly once from Profile. The
-- separate "join a quiz as a guest" flow is unaffected: it still collects
-- and requires a Register Number up front, same as always.
--
-- Safe to re-run: idempotent, never drops or overwrites existing data.
-- ============================================================================
alter table students alter column register_number drop not null;

alter table students drop constraint if exists students_register_number_key;
drop index if exists students_register_number_key;
drop index if exists idx_students_register_number_unique;
create unique index idx_students_register_number_unique
  on students (register_number)
  where register_number is not null;

drop index if exists idx_students_email_unique;
create unique index idx_students_email_unique
  on students (lower(email))
  where email is not null and password_hash is not null;

alter table students drop constraint if exists students_email_format;
alter table students add constraint students_email_format
  check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- ============================================================================
-- Playground (Programming tab) history
-- (see backend/sql/migration_playground_history.sql for the full explanation)
--
-- The standalone Playground has always been public and stateless. This adds
-- durable per-student storage for it (Dashboard "Programming practice" +
-- admin per-student detail). A run is only ever saved when the request
-- carried a valid student account token; an anonymous visitor's runs are
-- never written anywhere, and the Playground stays usable without signing
-- in exactly as before.
-- ============================================================================
create table if not exists playground_runs (
  id uuid primary key default gen_random_uuid(),
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

alter table playground_runs enable row level security;


-- ============================================================================
-- AI-powered inclusive learning platform
--
-- Adds the tables behind:
--   * AI learning profile (preferences, language, accessibility, XP, streak)
--   * Adaptive learning engine (per-topic mastery) + adaptive quiz sessions
--   * AI Tutor / Content Simplifier usage log (topic analytics for teachers)
--
-- Safe to re-run: every statement is `if not exists` / idempotent, and nothing
-- that already exists is touched. Same convention as the rest of this project:
-- Row Level Security is ENABLED with NO policies — only the Express backend
-- (service-role key) can read or write, and it always scopes by the student id
-- taken from the verified JWT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- learning_profiles — one row per signed-in student
-- ----------------------------------------------------------------------------
create table if not exists learning_profiles (
  student_id uuid primary key references students (id) on delete cascade,
  preferred_language text not null default 'en'
    check (preferred_language in ('en', 'ta')),
  explanation_style text not null default 'step_by_step'
    check (explanation_style in ('simple', 'step_by_step', 'example')),
  goal text,
  accessibility jsonb not null default '{}'::jsonb,
  xp integer not null default 0,
  streak_days integer not null default 0,
  last_active_date date,
  total_practice_answers integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- topic_mastery — the adaptive engine's per-student, per-topic estimate
-- ----------------------------------------------------------------------------
create table if not exists topic_mastery (
  student_id uuid not null references students (id) on delete cascade,
  topic_id text not null,
  mastery numeric not null default 0.3 check (mastery >= 0 and mastery <= 1),
  attempts integer not null default 0,
  correct integer not null default 0,
  current_level text not null default 'easy'
    check (current_level in ('easy', 'medium', 'hard')),
  last_practiced_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (student_id, topic_id)
);

create index if not exists idx_topic_mastery_topic on topic_mastery (topic_id);

-- ----------------------------------------------------------------------------
-- adaptive_sessions — one adaptive quiz run
-- `current_state` holds the question currently being asked and its shuffled
-- option order, so the answer key never has to leave the server.
-- ----------------------------------------------------------------------------
create table if not exists adaptive_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  topic_id text,
  language text not null default 'en' check (language in ('en', 'ta')),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned')),
  total_questions integer not null default 8,
  answered_count integer not null default 0,
  correct_count integer not null default 0,
  current_level text not null default 'easy'
    check (current_level in ('easy', 'medium', 'hard')),
  correct_streak integer not null default 0,
  wrong_streak integer not null default 0,
  level_path jsonb not null default '[]'::jsonb,
  served_ids jsonb not null default '[]'::jsonb,
  current_state jsonb,
  xp_earned integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_adaptive_sessions_student
  on adaptive_sessions (student_id, started_at desc);

-- ----------------------------------------------------------------------------
-- adaptive_answers — every answered adaptive question (weak-topic analytics)
-- ----------------------------------------------------------------------------
create table if not exists adaptive_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references adaptive_sessions (id) on delete cascade,
  student_id uuid not null references students (id) on delete cascade,
  topic_id text not null,
  question_id text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  selected_index integer,
  is_correct boolean not null,
  time_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_adaptive_answers_student
  on adaptive_answers (student_id, created_at desc);
create index if not exists idx_adaptive_answers_topic
  on adaptive_answers (topic_id);

-- ----------------------------------------------------------------------------
-- ai_tutor_logs — what students ask the tutor / simplifier (truncated question
-- only, never the AI answer). Powers "which topics confuse the class" on the
-- teacher dashboard; students are told teachers can see their question topics.
-- ----------------------------------------------------------------------------
create table if not exists ai_tutor_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  mode text not null check (mode in ('chat', 'voice', 'simplify')),
  language text not null default 'en',
  topic_id text,
  question text not null,
  provider text not null default 'local',
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_tutor_logs_student
  on ai_tutor_logs (student_id, created_at desc);
create index if not exists idx_ai_tutor_logs_topic
  on ai_tutor_logs (topic_id);

alter table learning_profiles enable row level security;
alter table topic_mastery enable row level security;
alter table adaptive_sessions enable row level security;
alter table adaptive_answers enable row level security;
alter table ai_tutor_logs enable row level security;
