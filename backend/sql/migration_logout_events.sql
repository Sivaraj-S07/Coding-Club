-- Records why a student's quiz attempt was force-ended (e.g. exceeding the
-- proctoring tab-switch/violation limit auto-submitted the attempt and
-- signed the student out of the quiz). Shown back to the student on their
-- Dashboard. Safe to run more than once.

create table if not exists student_logout_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  quiz_id uuid references quizzes(id) on delete set null,
  quiz_title text,
  reason text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_logout_events_student on student_logout_events (student_id, created_at desc);
