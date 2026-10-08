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
