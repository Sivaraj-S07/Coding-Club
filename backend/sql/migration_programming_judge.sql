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
