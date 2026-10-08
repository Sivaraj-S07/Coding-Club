const { getSupabase } = require("../config/supabaseClient");

// The Rounds feature needs a `rounds` table and a `questions.round_id` column
// (see backend/sql/schema.sql). A database that hasn't had the latest schema
// applied yet must keep working exactly as before instead of hard-failing, so
// we probe support once and cache the answer for the life of the process.
let roundsSupportPromise = null;

async function probeRoundsSupport() {
  const supabase = getSupabase();
  try {
    const [roundsProbe, questionProbe] = await Promise.all([
      supabase.from("rounds").select("id").limit(1),
      supabase.from("questions").select("round_id").limit(1),
    ]);
    return !roundsProbe.error && !questionProbe.error;
  } catch {
    return false;
  }
}

async function roundsSupported() {
  if (!roundsSupportPromise) roundsSupportPromise = probeRoundsSupport();
  return roundsSupportPromise;
}

// Per-question time limits need `questions.time_limit_seconds`. Databases that
// haven't applied the latest schema keep working (no per-question timers).
let timeLimitSupportPromise = null;

async function probeQuestionTimeLimitSupport() {
  const supabase = getSupabase();
  try {
    const probe = await supabase.from("questions").select("time_limit_seconds").limit(1);
    return !probe.error;
  } catch {
    return false;
  }
}

async function questionTimeLimitSupported() {
  if (!timeLimitSupportPromise) timeLimitSupportPromise = probeQuestionTimeLimitSupport();
  return timeLimitSupportPromise;
}

// Server-authoritative per-question timing needs the `question_timings` table
// and `quiz_attempts.current_question_index` (backend/sql/schema.sql). Until the
// migration is applied the API keeps working — it just cannot enforce
// per-question deadlines server-side.
let timingSupportPromise = null;

async function probeQuestionTimingSupport() {
  const supabase = getSupabase();
  try {
    const [timings, attempts] = await Promise.all([
      supabase.from("question_timings").select("id").limit(1),
      supabase.from("quiz_attempts").select("current_question_index").limit(1),
    ]);
    if (timings.error || attempts.error) {
      console.warn(
        "⚠️  question_timings / quiz_attempts.current_question_index missing — run backend/sql/schema.sql to enable server-side per-question timers."
      );
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function questionTimingSupported() {
  if (!timingSupportPromise) timingSupportPromise = probeQuestionTimingSupport();
  return timingSupportPromise;
}


// Per-notification admin read state needs `admin_notification_reads`.
let notificationReadsPromise = null;

async function probeNotificationReadsSupport() {
  const supabase = getSupabase();
  try {
    const probe = await supabase.from("admin_notification_reads").select("id").limit(1);
    return !probe.error;
  } catch {
    return false;
  }
}

async function notificationReadsSupported() {
  if (!notificationReadsPromise) notificationReadsPromise = probeNotificationReadsSupport();
  return notificationReadsPromise;
}

// Round qualification gate needs `rounds.qualification_percentage`.
let roundQualificationPromise = null;

async function probeRoundQualificationSupport() {
  const supabase = getSupabase();
  try {
    const probe = await supabase.from("rounds").select("qualification_percentage").limit(1);
    return !probe.error;
  } catch {
    return false;
  }
}

async function roundQualificationSupported() {
  if (!roundQualificationPromise) roundQualificationPromise = probeRoundQualificationSupport();
  return roundQualificationPromise;
}


// Some older databases created `rounds` without an `updated_at` column.
// Writing to a missing column fails the whole UPDATE (Postgres 42703), so we
// probe for it and simply skip the timestamp when it isn't there.
let roundUpdatedAtPromise = null;

async function probeRoundUpdatedAtSupport() {
  const supabase = getSupabase();
  try {
    const probe = await supabase.from("rounds").select("updated_at").limit(1);
    return !probe.error;
  } catch {
    return false;
  }
}

async function roundUpdatedAtSupported() {
  if (!roundUpdatedAtPromise) roundUpdatedAtPromise = probeRoundUpdatedAtSupport();
  return roundUpdatedAtPromise;
}


// LeetCode-style programming questions need `questions.test_cases` (and the
// sibling problem columns) plus `answers.judge_result`. Databases that have
// not applied backend/sql/migration_programming_judge.sql keep working with
// the previous expected-output grading instead of hard-failing.
let codingJudgePromise = null;

async function probeCodingJudgeSupport() {
  const supabase = getSupabase();
  try {
    const [questionProbe, answerProbe] = await Promise.all([
      supabase.from("questions").select("test_cases, sample_io, time_limit_ms").limit(1),
      supabase.from("answers").select("judge_result").limit(1),
    ]);
    if (questionProbe.error || answerProbe.error) {
      console.warn(
        "\u26a0\ufe0f  Programming-judge columns missing \u2014 run backend/sql/migration_programming_judge.sql to enable hidden test cases."
      );
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function codingJudgeSupported() {
  if (!codingJudgePromise) codingJudgePromise = probeCodingJudgeSupport();
  return codingJudgePromise;
}

// Single-active-session-per-Register-Number lock (Maximum Attempt + Resume
// Quiz system) needs `students.active_session_token` (+ its two sibling
// columns). Pre-migration databases keep working exactly as before — the
// login/rejoin flow simply skips the single-session check until this is run.
let sessionLockPromise = null;

async function probeSessionLockSupport() {
  const supabase = getSupabase();
  try {
    const probe = await supabase
      .from("students")
      .select("active_session_token, active_session_quiz_id, active_session_started_at")
      .limit(1);
    if (probe.error) {
      console.warn(
        "⚠️  students.active_session_* columns missing — run backend/sql/migration_quiz_session_lock.sql to enforce one active quiz session per Register Number."
      );
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function sessionLockSupported() {
  if (!sessionLockPromise) sessionLockPromise = probeSessionLockSupport();
  return sessionLockPromise;
}

// Exposed so a failed write can force a fresh probe on the next request.
function resetRoundsSupportCache() {
  roundsSupportPromise = null;
  roundQualificationPromise = null;
  roundUpdatedAtPromise = null;
}

module.exports = {
  roundsSupported,
  resetRoundsSupportCache,
  questionTimeLimitSupported,
  questionTimingSupported,
  notificationReadsSupported,
  roundQualificationSupported,
  roundUpdatedAtSupported,
  codingJudgeSupported,
  sessionLockSupported,
};
