const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { gradeAttempt } = require("../utils/scoring");
const { seededShuffle } = require("../utils/shuffle");
const {
  roundsSupported,
  questionTimingSupported,
  questionTimeLimitSupported,
  roundQualificationSupported,
  codingJudgeSupported,
  sessionLockSupported,
} = require("../utils/featureSupport");
const { runTestCases, executeCode, SUPPORTED_LANGUAGES } = require("../utils/codeRunner");
const { emitAdmin } = require("../realtime");
const { rankAttempts, timeTakenSeconds } = require("../utils/ranking");
const { buildAnswerReview } = require("../utils/answerReview");
const { abortSignalForRequest } = require("../utils/requestAbort");

function ensureOwnQuiz(req) {
  if (req.student.quizId !== req.params.id) {
    throw new ApiError(403, "This session does not belong to this quiz");
  }
}

// Human-friendly explanations for why a quiz attempt was force-ended by the
// proctoring system, shown to the student in a popup and stored so the
// Dashboard (and the Admin Portal's Security Log) can show it later too.
//
// Only genuinely suspicious actions reach here at all — see HARD_REASONS /
// COUNTED_REASONS below. Screen lock/wake and a temporary internet
// disconnection are never even reported by the client, so they can never
// produce a logout or an entry here.
const LOGOUT_REASON_TEXT = {
  tab_switch: "You switched away from the quiz tab or minimized the window.",
  window_blur: "You switched to another application or window.",
  fullscreen_exit: "You exited fullscreen / secure quiz mode.",
  new_tab_blocked: "You tried to open another tab, window, or a third-party/external site.",
  devtools_attempt: "You tried to open developer tools.",
  navigation_attempt: "You tried to leave the quiz page.",
  screenshot_attempt: "A screenshot / screen-capture attempt was detected.",
};

// `hard` reasons (see HARD_REASONS) end the attempt on their very first
// occurrence, so the message says that plainly instead of citing a limit
// that was never actually counted up to.
function logoutMessageFor(reason, { hard, limit } = {}) {
  const cause = LOGOUT_REASON_TEXT[reason] || "Suspicious activity outside the quiz was detected.";
  if (hard) {
    return `${cause} This is a quiz-security violation, so your attempt was immediately submitted and you were signed out.`;
  }
  return `${cause} The proctoring limit (${limit}) was reached, so your attempt was automatically submitted and you were signed out of the quiz.`;
}

// Best-effort record of a forced quiz-attempt logout, read back by the
// Dashboard (GET /students/account/logout-events) and by the Admin Portal's
// Security Log (GET /admin/logout-events). Never allowed to break the
// quiz-submission flow it's called from — a missing table/column (migration
// not yet run) or any other write failure is silently ignored, and older
// databases without the `details` column still work (details is dropped and
// the insert retried).
async function recordLogoutEvent(supabase, { studentId, quizId, quizTitle, reason, message, details }) {
  const row = { student_id: studentId, quiz_id: quizId, quiz_title: quizTitle, reason, message };
  try {
    const { error } = await supabase.from("student_logout_events").insert({ ...row, details: details || null });
    if (error) {
      // Could be an older DB without the `details` column (migration not
      // yet run) — retry once without it before giving up silently.
      await supabase.from("student_logout_events").insert(row);
    }
  } catch {
    // best-effort only
  }
}

// Fetches everything needed for both showing questions to the student AND
// server-side grading. expected_output / reference_solution are the "answer
// key" for coding questions — they must NEVER be included in what we send
// back to the client (see questionsForClient below, which whitelists fields).
async function loadQuizQuestions(supabase, quizId) {
  const [withRounds, withTimeLimit, withJudge] = await Promise.all([
    roundsSupported(),
    questionTimeLimitSupported(),
    codingJudgeSupported(),
  ]);
  const columns =
    "id, question_text, marks, negative_marks, order_index, question_type, language, starter_code, expected_output, reference_solution, blank_answers, case_sensitive, quiz_options(id, option_text, is_correct, order_index)" +
    (withRounds ? ", round_id" : "") +
    // Without this column the admin-configured per-question countdown never
    // reaches the student, so the timer silently does nothing.
    (withTimeLimit ? ", time_limit_seconds" : "") +
    // LeetCode-style problem definition + hidden test cases (answer key —
    // stripped before anything is sent to the student, see questionsForClient).
    (withJudge
      ? ", problem_statement, input_format, output_format, constraints_text, sample_io, test_cases, time_limit_ms, allowed_languages"
      : "");
  const { data, error } = await supabase
    .from("questions")
    .select(columns)
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });
  if (error) throw new ApiError(500, "Failed to load questions", error.message);
  return data || [];
}

// Ordered rounds for a quiz — [] when the database predates the rounds feature.
async function loadQuizRounds(supabase, quizId) {
  if (!(await roundsSupported())) return [];
  const withQualification = await roundQualificationSupported();
  const { data, error } = await supabase
    .from("rounds")
    .select("id, name, description, order_index" + (withQualification ? ", qualification_percentage" : ""))
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });
  if (error) return [];
  return data || [];
}

// Questions are always delivered round-by-round: round 1's questions first,
// then round 2's, with unassigned questions last. Randomization (when enabled)
// only shuffles *within* a round so the round structure is preserved.
function buildQuestionOrder(questions, rounds, { randomize, seed }) {
  const rank = new Map(rounds.map((r, i) => [r.id, i]));
  const groups = new Map();
  questions.forEach((q) => {
    const key = q.round_id && rank.has(q.round_id) ? rank.get(q.round_id) : Number.MAX_SAFE_INTEGER;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q.id);
  });
  return [...groups.keys()]
    .sort((a, b) => a - b)
    .flatMap((key) => {
      const ids = groups.get(key);
      return randomize ? seededShuffle(ids, `${seed}:${key}`) : ids;
    });
}

function deadlineFor(attempt, quiz) {
  const startedAt = new Date(attempt.started_at).getTime();
  return startedAt + quiz.duration_minutes * 60 * 1000;
}

// --------------------------------------------------------------------------
// Server-authoritative per-question timing
//
// The countdown for a question lives in the question_timings table, created
// once when the question first becomes active. It is never reset, so a page
// refresh, a new tab or a replayed API call all read the same expires_at.
// --------------------------------------------------------------------------
function questionLimitSeconds(question) {
  const limit = Number(question?.time_limit_seconds || 0);
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

async function loadTimings(supabase, attemptId) {
  if (!(await questionTimingSupported())) return [];
  const { data } = await supabase
    .from("question_timings")
    .select("question_id, started_at, expires_at, expired")
    .eq("attempt_id", attemptId);
  return data || [];
}

function timingIsExpired(row) {
  if (!row) return false;
  if (row.expired) return true;
  return !!row.expires_at && Date.now() > new Date(row.expires_at).getTime();
}

// Returns the timing row for a question, creating it on first activation.
async function ensureTiming(supabase, attempt, question) {
  const limit = questionLimitSeconds(question);
  if (!(await questionTimingSupported())) {
    // Schema not migrated yet — issue a deadline without persisting it.
    const now = new Date();
    return {
      question_id: question.id,
      started_at: now.toISOString(),
      expires_at: limit ? new Date(now.getTime() + limit * 1000).toISOString() : null,
      expired: false,
    };
  }
  const { data: existing } = await supabase
    .from("question_timings")
    .select("question_id, started_at, expires_at, expired")
    .eq("attempt_id", attempt.id)
    .eq("question_id", question.id)
    .maybeSingle();

  if (existing) {
    if (!existing.expired && timingIsExpired(existing)) {
      await supabase
        .from("question_timings")
        .update({ expired: true })
        .eq("attempt_id", attempt.id)
        .eq("question_id", question.id);
      return { ...existing, expired: true };
    }
    return existing;
  }

  const startedAt = new Date();
  const row = {
    attempt_id: attempt.id,
    question_id: question.id,
    started_at: startedAt.toISOString(),
    expires_at: limit ? new Date(startedAt.getTime() + limit * 1000).toISOString() : null,
    expired: false,
  };
  // upsert (not insert) so two parallel requests can never create two timers
  // or restart an existing one.
  const { data: created } = await supabase
    .from("question_timings")
    .upsert(row, { onConflict: "attempt_id,question_id", ignoreDuplicates: true })
    .select("question_id, started_at, expires_at, expired")
    .maybeSingle();
  if (created) return created;
  const { data: raced } = await supabase
    .from("question_timings")
    .select("question_id, started_at, expires_at, expired")
    .eq("attempt_id", attempt.id)
    .eq("question_id", question.id)
    .maybeSingle();
  return raced || { ...row, question_id: question.id };
}

// Only the safe, student-visible part of a judge verdict. Hidden test-case
// inputs/expected outputs are never included.
// judge_result / language only exist after migration_programming_judge.sql —
// select them conditionally so older databases keep working.
async function answerColumns(base = "question_id, selected_option_id, code_answer, blank_answer") {
  return (await codingJudgeSupported()) ? `${base}, judge_result, language` : base;
}

function summarizeJudge(judge) {
  if (!judge || typeof judge !== "object") return null;
  return {
    status: judge.status || "ok",
    passed: Number(judge.passed || 0),
    total: Number(judge.total || 0),
    language: judge.language || null,
    message: judge.message || null,
    judgedAt: judge.judgedAt || null,
  };
}

function shapeTiming(row) {
  return {
    questionId: row.question_id,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    expired: timingIsExpired(row),
    remainingSeconds: row.expires_at
      ? Math.max(0, Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000))
      : null,
  };
}


// --------------------------------------------------------------------------
// Round qualification
//
// Each round can require a minimum percentage (rounds.qualification_percentage).
// A student only unlocks the next round when the questions of the round they
// just finished were answered correctly at (or above) that percentage.
// The percentage is measured on correct answers, so "10 questions, 50%" means
// "at least 5 correct" exactly as configured by the admin.
// --------------------------------------------------------------------------
function roundRequirement(round) {
  const pct = Number(round?.qualification_percentage || 0);
  return Number.isFinite(pct) && pct > 0 ? Math.min(100, pct) : 0;
}

async function loadAnswersMap(supabase, attemptId) {
  const { data: answers, error } = await supabase
    .from("answers")
    .select(await answerColumns())
    .eq("attempt_id", attemptId);
  if (error) throw new ApiError(500, "Failed to load answers", error.message);
  return new Map(
    (answers || []).map((a) => [
      a.question_id,
      { optionId: a.selected_option_id, code: a.code_answer, blanks: a.blank_answer, judge: a.judge_result || null },
    ])
  );
}

// Grades only the questions belonging to `roundId` and decides qualification.
function evaluateRound(round, questions, answersMap) {
  const roundQuestions = questions.filter((q) => q.round_id === round.id);
  const graded = gradeAttempt(roundQuestions, answersMap);
  const totalQuestions = roundQuestions.length;
  const required = roundRequirement(round);
  const percentage = totalQuestions ? Math.round((graded.correct / totalQuestions) * 1000) / 10 : 0;
  const requiredCorrect = totalQuestions ? Math.ceil((required / 100) * totalQuestions) : 0;
  return {
    roundId: round.id,
    roundName: round.name,
    totalQuestions,
    correct: graded.correct,
    wrong: graded.wrong,
    unanswered: graded.unanswered,
    obtainedMarks: graded.obtainedMarks,
    totalMarks: graded.totalMarks,
    percentage,
    requiredPercentage: required,
    requiredCorrect,
    qualified: required === 0 || totalQuestions === 0 || graded.correct >= requiredCorrect,
  };
}

// True when every round before `round` was cleared by this attempt.
async function previousRoundsCleared(supabase, attempt, quiz, rounds, roundId) {
  const index = rounds.findIndex((r) => r.id === roundId);
  if (index <= 0) return true;
  const gated = rounds.slice(0, index).filter((r) => roundRequirement(r) > 0);
  if (!gated.length) return true;
  const [questions, answersMap] = await Promise.all([
    loadQuizQuestions(supabase, quiz.id),
    loadAnswersMap(supabase, attempt.id),
  ]);
  return gated.every((r) => evaluateRound(r, questions, answersMap).qualified);
}

async function judgePendingCodingAnswers(supabase, attempt, questions, answersMap) {
  const supportsJudge = await codingJudgeSupported();
  const pending = questions.filter((q) => {
    if (q.question_type !== "coding") return false;
    const answer = answersMap.get(q.id);
    if (!answer || !answer.code || !String(answer.code).trim()) return false;
    return !answer.judge; // already judged at Submit time
  });
  if (!pending.length) return;

  for (const question of pending) {
    const answer = answersMap.get(question.id);
    try {
      const languages =
        Array.isArray(question.allowed_languages) && question.allowed_languages.length
          ? question.allowed_languages
          : [question.language];
      const verdict = await runTestCases({
        language: answer.language || languages[0],
        source: answer.code,
        testCases: Array.isArray(question.test_cases) ? question.test_cases : [],
        timeLimitMs: question.time_limit_ms ? Number(question.time_limit_ms) : 3000,
        expectedOutput: question.expected_output,
      });
      const judge = {
        status: verdict.status,
        passed: verdict.passed,
        total: verdict.total,
        language: answer.language || languages[0] || null,
        message: verdict.message || null,
        judgedAt: new Date().toISOString(),
        // Per-case verdicts (already redacted by the judge: hidden+passed
        // cases carry no input/expectedOutput, hidden+failed cases carry
        // only those two fields, sample cases carry everything) so the
        // student's later result review can still show what tripped a
        // failed hidden case, without exposing hidden cases they passed.
        cases: verdict.results || [],
      };
      answersMap.set(question.id, { ...answer, judge });
      if (supportsJudge) {
        await supabase
          .from("answers")
          .update({ judge_result: judge })
          .eq("attempt_id", attempt.id)
          .eq("question_id", question.id);
      }
    } catch (err) {
      // Judge unavailable — fall back to the legacy comparison in scoring.js
      // rather than failing the whole submission.
      console.error("Auto-judge failed for question", question.id, err.message);
    }
  }
}

async function finalizeAttempt(supabase, attempt, quiz, status) {
  const questions = await loadQuizQuestions(supabase, quiz.id);
  const { data: answers, error: answersError } = await supabase
    .from("answers")
    .select(await answerColumns())
    .eq("attempt_id", attempt.id);
  if (answersError) {
    // Do NOT silently grade as "all unanswered" on a transient DB error.
    throw new ApiError(500, "Failed to load answers for grading", answersError.message);
  }

  const answersMap = new Map(
    (answers || []).map((a) => [
      a.question_id,
      { optionId: a.selected_option_id, code: a.code_answer, blanks: a.blank_answer, judge: a.judge_result || null },
    ])
  );
  // Safety net: a student may have typed code and let the timer run out without
  // pressing Submit. Judge those answers now so they still earn their marks —
  // grading always uses the server's own verdict, never anything client-sent.
  await judgePendingCodingAnswers(supabase, attempt, questions, answersMap);

  const graded = gradeAttempt(questions, answersMap);
  const passed = quiz.max_marks > 0
    ? graded.percentage >= Number(quiz.passing_percentage)
    : false;

  // Persist the marks awarded per answer (best-effort — unanswered questions
  // have no answer row to update, which is fine). This lets result views
  // show exactly how much a coding submission earned.
  if (graded.perQuestion.length) {
    await Promise.all(
      graded.perQuestion.map((pq) =>
        supabase
          .from("answers")
          .update({ marks_awarded: pq.marksAwarded })
          .eq("attempt_id", attempt.id)
          .eq("question_id", pq.questionId)
      )
    );
  }

  const { data: updated, error } = await supabase
    .from("quiz_attempts")
    .update({
      status,
      submitted_at: new Date().toISOString(),
      total_marks: graded.totalMarks,
      obtained_marks: graded.obtainedMarks,
      correct_count: graded.correct,
      wrong_count: graded.wrong,
      unanswered_count: graded.unanswered,
      percentage: graded.percentage,
      passed,
    })
    .eq("id", attempt.id)
    .select("*")
    .single();
  if (error) throw new ApiError(500, "Failed to finalize attempt", error.message);

  await supabase
    .from("attendance")
    .update({ submission_time: new Date().toISOString(), completed: true })
    .eq("quiz_id", quiz.id)
    .eq("student_id", attempt.student_id);

  // The quiz is genuinely over for this student now (submitted, auto-
  // submitted, or timed out), so free up their single-active-quiz-session
  // lock immediately — no need to wait for an explicit logout before they
  // can join a different quiz with the same Register Number. Best-effort:
  // never let this break grading/submission.
  if (await sessionLockSupported()) {
    try {
      await supabase
        .from("students")
        .update({ active_session_token: null, active_session_quiz_id: null, active_session_started_at: null })
        .eq("id", attempt.student_id)
        .eq("active_session_quiz_id", quiz.id);
    } catch {
      // best-effort only
    }
  }

  emitAdmin("result:new", {
    quizId: quiz.id,
    attemptId: updated.id,
    studentId: attempt.student_id,
    status,
    obtainedMarks: updated.obtained_marks,
    percentage: updated.percentage,
    passed: updated.passed,
    submittedAt: updated.submitted_at,
  });

  return { attempt: updated, graded };
}

// POST /api/quizzes/:id/start
const startAttempt = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const supabase = getSupabase();

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();
  if (quizError) throw new ApiError(500, "Failed to load quiz", quizError.message);
  if (!quiz) throw new ApiError(404, "Quiz not found");

  const now = new Date();
  if (quiz.end_time && now > new Date(quiz.end_time) && !quiz.allow_late_join) {
    throw new ApiError(403, "This quiz has ended");
  }

  const { data: attempts, error: attemptsError } = await supabase
    .from("quiz_attempts")
    .select("*")
    .eq("quiz_id", quiz.id)
    .eq("student_id", req.student.studentId)
    .order("attempt_number", { ascending: false });
  if (attemptsError) {
    // Do NOT silently treat this as "no prior attempts" — that would let a
    // student bypass max_attempts if this query merely failed transiently.
    throw new ApiError(500, "Failed to load previous attempts", attemptsError.message);
  }

  let attempt = (attempts || []).find((a) => a.status === "in_progress");

  if (!attempt) {
    const submittedCount = (attempts || []).filter(
      (a) => a.status === "submitted" || a.status === "auto_submitted"
    ).length;
    if (submittedCount >= quiz.max_attempts) {
      throw new ApiError(403, "You have already used all allowed attempts for this quiz");
    }

    const questions = await loadQuizQuestions(supabase, quiz.id);
    if (questions.length === 0) throw new ApiError(409, "This quiz has no questions yet");

    const rounds = await loadQuizRounds(supabase, quiz.id);
    const questionIds = buildQuestionOrder(questions, rounds, {
      randomize: quiz.randomize_questions,
      seed: `${quiz.id}:${req.student.studentId}:q`,
    });

    const { data: created, error: createError } = await supabase
      .from("quiz_attempts")
      .insert({
        quiz_id: quiz.id,
        student_id: req.student.studentId,
        attempt_number: submittedCount + 1,
        status: "in_progress",
        question_order: questionIds,
        started_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (createError) {
      // A duplicate-tab / double-click race: two /start requests both saw
      // "no in-progress attempt yet" and both tried to insert the same
      // (quiz_id, student_id, attempt_number). Only one insert can win the
      // unique constraint — instead of surfacing that as a raw 500, re-fetch
      // and use the attempt the winning request just created. The
      // single-active-quiz-session lock (see studentController.js) already
      // prevents this from happening across two different logins; this only
      // covers two concurrent requests from within the *same* session (e.g.
      // a slow network causing a retried click), so max-attempt accounting
      // is never double-counted or left in a broken state either way.
      const isUniqueViolation =
        createError.code === "23505" || /duplicate key|already exists/i.test(createError.message || "");
      if (isUniqueViolation) {
        const { data: retryAttempts } = await supabase
          .from("quiz_attempts")
          .select("*")
          .eq("quiz_id", quiz.id)
          .eq("student_id", req.student.studentId)
          .order("attempt_number", { ascending: false });
        attempt = (retryAttempts || []).find((a) => a.status === "in_progress");
      }
      if (!attempt) throw new ApiError(500, "Failed to start attempt", createError.message);
    } else {
      attempt = created;
    }

    await supabase
      .from("attendance")
      .update({ quiz_start_time: new Date().toISOString() })
      .eq("quiz_id", quiz.id)
      .eq("student_id", req.student.studentId);
  }

  const deadline = deadlineFor(attempt, quiz);
  if (Date.now() > deadline) {
    const { attempt: finalized } = await finalizeAttempt(supabase, attempt, quiz, "auto_submitted");
    return res.status(410).json({
      success: false,
      message: "Time is up — this attempt has been auto-submitted",
      attemptId: finalized.id,
      expired: true,
    });
  }

  const questions = await loadQuizQuestions(supabase, quiz.id);
  const rounds = await loadQuizRounds(supabase, quiz.id);
  const roundById = Object.fromEntries(rounds.map((r) => [r.id, r]));
  const byId = Object.fromEntries(questions.map((q) => [q.id, q]));
  // Questions added after this attempt started are appended in round order so
  // the student never sees a partially-loaded round.
  const storedOrder = (attempt.question_order || []).filter((id) => byId[id]);
  const missing = buildQuestionOrder(
    questions.filter((q) => !storedOrder.includes(q.id)),
    rounds,
    { randomize: false, seed: "" }
  );
  const orderedIds = storedOrder.length || missing.length ? [...storedOrder, ...missing] : questions.map((q) => q.id);

  const { data: existingAnswers } = await supabase
    .from("answers")
    .select(await answerColumns("question_id, selected_option_id, code_answer"))
    .eq("attempt_id", attempt.id);
  const answeredIds = (existingAnswers || []).map((a) => a.question_id);
  // Previously-submitted code (and its verdict) so a refresh restores the editor.
  const codeAnswers = {};
  (existingAnswers || []).forEach((a) => {
    if (a.code_answer) {
      codeAnswers[a.question_id] = {
        code: a.code_answer,
        judge: summarizeJudge(a.judge_result),
      };
    }
  });

  const questionsForClient = orderedIds
    .filter((id) => byId[id])
    .map((id) => {
      const q = byId[id];
      const type = q.question_type || "mcq";
      const round = q.round_id ? roundById[q.round_id] : null;
      const roundInfo = {
        roundId: round ? round.id : null,
        roundName: round ? round.name : null,
        // Per-question time limit set by the admin (null = no limit).
        timeLimitSeconds:
          q.time_limit_seconds && Number(q.time_limit_seconds) > 0 ? Number(q.time_limit_seconds) : null,
      };

      if (type === "coding") {
        // Only ever send the problem + starter code — never expected_output
        // or reference_solution, which is the answer key.
        const languages =
          Array.isArray(q.allowed_languages) && q.allowed_languages.length
            ? q.allowed_languages
            : q.language
              ? [q.language]
              : [];
        return {
          ...roundInfo,
          id: q.id,
          type: "coding",
          text: q.question_text,
          marks: q.marks,
          negativeMarks: Number(q.negative_marks || 0),
          language: q.language,
          languages,
          starterCode: q.starter_code || "",
          problemStatement: q.problem_statement || "",
          inputFormat: q.input_format || "",
          outputFormat: q.output_format || "",
          constraintsText: q.constraints_text || "",
          // Sample I/O is meant to be visible; hidden test cases never leave the server.
          sampleIo: Array.isArray(q.sample_io) ? q.sample_io : [],
          testCaseCount: Array.isArray(q.test_cases) ? q.test_cases.length : 0,
          timeLimitMs: q.time_limit_ms ? Number(q.time_limit_ms) : 3000,
          options: [],
        };
      }

      if (type === "fill_blank") {
        // Only ever send how many blanks there are — never blank_answers,
        // which is the answer key.
        return {
          ...roundInfo,
          id: q.id,
          type: "fill_blank",
          text: q.question_text,
          marks: q.marks,
          negativeMarks: Number(q.negative_marks || 0),
          blanksCount: Array.isArray(q.blank_answers) ? q.blank_answers.length : 1,
          options: [],
        };
      }

      let options = q.quiz_options.map((o) => ({ id: o.id, text: o.option_text }));
      if (quiz.randomize_options) {
        options = seededShuffle(options, `${quiz.id}:${req.student.studentId}:${q.id}`);
      } else {
        options.sort((a, b) => a.order_index - b.order_index);
      }
      return {
        ...roundInfo,
        id: q.id,
        type: "mcq",
        text: q.question_text,
        marks: q.marks,
        negativeMarks: q.negative_marks,
        options,
      };
    });

  // Timers already running for this attempt (so a refresh resumes them exactly
  // where the server says they are, instead of restarting the countdown).
  const timingRows = await loadTimings(supabase, attempt.id);
  const questionTimers = timingRows.map(shapeTiming);

  res.json({
    success: true,
    attemptId: attempt.id,
    serverTime: new Date().toISOString(),
    currentIndex: Number(attempt.current_question_index || 0),
    questionTimers,
    quiz: {
      id: quiz.id,
      title: quiz.title,
      durationMinutes: quiz.duration_minutes,
      tabSwitchLimit: quiz.tab_switch_limit,
      // "landing" placement = a Demo Quiz (joined from the public Landing
      // Page / the "Demo Quiz" nav tab) vs. the regular "Quizzes" tab —
      // used only to send the student back to the right listing page after
      // a forced proctoring logout. Pre-migration databases have no
      // `placement` column at all, in which case it's simply absent here
      // and the frontend falls back to "Quizzes" as before.
      placement: quiz.placement || "quizzes",
    },
    questions: questionsForClient,
    rounds: rounds.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description || "",
      qualificationPercentage: Number(r.qualification_percentage || 0),
    })),
    answeredQuestionIds: answeredIds,
    codeAnswers,
    remainingSeconds: Math.max(0, Math.floor((deadline - Date.now()) / 1000)),
    violationsCount: attempt.violations_count,
  });
});

// Databases that haven't applied the latest schema have no
// `questions.time_limit_seconds`, and selecting a missing column errors out —
// so the column is only requested when it exists.
async function fetchQuestion(supabase, questionId) {
  const withRounds = await roundsSupported();
  const columns =
    "id, quiz_id" +
    (withRounds ? ", round_id" : "") +
    ((await questionTimeLimitSupported()) ? ", time_limit_seconds" : "");
  return supabase.from("questions").select(columns).eq("id", questionId).maybeSingle();
}

// POST /api/quizzes/:id/question/start — activate a question and get its
// server-owned deadline. Idempotent: calling it again (refresh, revisit, curl)
// returns the SAME started_at/expires_at, so the countdown can't be reset.
const activateQuestion = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const { questionId } = req.body || {};
  if (!questionId) throw new ApiError(400, "questionId is required");

  const supabase = getSupabase();
  const [{ data: attempt }, { data: quiz }] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("*")
      .eq("quiz_id", req.params.id)
      .eq("student_id", req.student.studentId)
      .eq("status", "in_progress")
      .maybeSingle(),
    supabase.from("quizzes").select("*").eq("id", req.params.id).maybeSingle(),
  ]);
  if (!quiz) throw new ApiError(404, "Quiz not found");
  if (!attempt) throw new ApiError(404, "No active attempt found");

  // Overall quiz duration is authoritative too.
  if (Date.now() > deadlineFor(attempt, quiz)) {
    await finalizeAttempt(supabase, attempt, quiz, "auto_submitted");
    throw new ApiError(410, "Time is up — this attempt has been auto-submitted");
  }

  const order = Array.isArray(attempt.question_order) ? attempt.question_order : [];
  const { data: question } = await fetchQuestion(supabase, questionId);
  if (!question || question.quiz_id !== quiz.id) {
    throw new ApiError(404, "Question does not belong to this quiz");
  }

  // A locked round can never be opened, even by replaying this call directly.
  if (question.round_id) {
    const rounds = await loadQuizRounds(supabase, quiz.id);
    if (!(await previousRoundsCleared(supabase, attempt, quiz, rounds, question.round_id))) {
      throw new ApiError(403, "You did not qualify for this round");
    }
  }

  const timing = await ensureTiming(supabase, attempt, question);

  const index = order.indexOf(questionId);
  if ((await questionTimingSupported()) && index >= 0 && index !== Number(attempt.current_question_index || 0)) {
    await supabase
      .from("quiz_attempts")
      .update({ current_question_index: index })
      .eq("id", attempt.id);
  }

  res.json({
    success: true,
    serverTime: new Date().toISOString(),
    timing: shapeTiming(timing),
    quizRemainingSeconds: Math.max(0, Math.floor((deadlineFor(attempt, quiz) - Date.now()) / 1000)),
  });
});

// POST /api/quizzes/:id/answer — autosave one answer
const saveAnswer = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const { questionId, optionId, code, blanks, language } = req.body || {};
  if (!questionId) throw new ApiError(400, "questionId is required");
  if (optionId === undefined && code === undefined && blanks === undefined) {
    throw new ApiError(400, "optionId, code, or blanks is required");
  }

  const supabase = getSupabase();
  const supportsJudge = await codingJudgeSupported();
  const [{ data: attempt }, { data: quiz }] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("*")
      .eq("quiz_id", req.params.id)
      .eq("student_id", req.student.studentId)
      .eq("status", "in_progress")
      .maybeSingle(),
    supabase.from("quizzes").select("*").eq("id", req.params.id).maybeSingle(),
  ]);
  if (!attempt) throw new ApiError(404, "No active attempt found");
  if (!quiz) throw new ApiError(404, "Quiz not found");

  if (Date.now() > deadlineFor(attempt, quiz)) {
    await finalizeAttempt(supabase, attempt, quiz, "auto_submitted");
    throw new ApiError(410, "Time is up — this attempt has been auto-submitted");
  }

  // Per-question deadline is enforced here, on the server — a tampered client
  // timer (dev tools, replayed request) cannot buy extra time.
  const { data: question } = await fetchQuestion(supabase, questionId);
  if (!question || question.quiz_id !== quiz.id) {
    throw new ApiError(404, "Question does not belong to this quiz");
  }
  if (question.round_id) {
    const rounds = await loadQuizRounds(supabase, quiz.id);
    if (!(await previousRoundsCleared(supabase, attempt, quiz, rounds, question.round_id))) {
      throw new ApiError(403, "You did not qualify for this round");
    }
  }

  if (questionLimitSeconds(question) && (await questionTimingSupported())) {
    const { data: timing } = await supabase
      .from("question_timings")
      .select("question_id, started_at, expires_at, expired")
      .eq("attempt_id", attempt.id)
      .eq("question_id", questionId)
      .maybeSingle();
    if (!timing) throw new ApiError(409, "This question is not active yet");
    if (timingIsExpired(timing)) {
      if (!timing.expired) {
        await supabase
          .from("question_timings")
          .update({ expired: true })
          .eq("attempt_id", attempt.id)
          .eq("question_id", questionId);
      }
      throw new ApiError(403, "Time for this question is over");
    }
  }

  const { error } = await supabase.from("answers").upsert(
    {
      attempt_id: attempt.id,
      question_id: questionId,
      selected_option_id: optionId !== undefined ? optionId || null : null,
      code_answer: code !== undefined ? code : null,
      blank_answer: blanks !== undefined ? blanks : null,
      // A draft save invalidates any earlier verdict — the code changed, so the
      // student must press Submit again (or finalization will judge it).
      ...(supportsJudge ? { judge_result: null, language: language || question.language || null } : {}),
      answered_at: new Date().toISOString(),
    },
    { onConflict: "attempt_id,question_id" }
  );
  if (error) throw new ApiError(500, "Failed to save answer", error.message);

  res.json({ success: true });
});

// POST /api/quizzes/:id/violation — log a tab-switch / proctoring violation
const logViolation = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const supabase = getSupabase();

  const [{ data: attempt }, { data: quiz }] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("*")
      .eq("quiz_id", req.params.id)
      .eq("student_id", req.student.studentId)
      .eq("status", "in_progress")
      .maybeSingle(),
    supabase.from("quizzes").select("*").eq("id", req.params.id).maybeSingle(),
  ]);
  if (!attempt) throw new ApiError(404, "No active attempt found");
  if (!quiz) throw new ApiError(404, "Quiz not found");

  // Proctoring events.
  //
  // HARD_REASONS are quiz-security violations — screenshots, tab switching,
  // app switching, leaving the quiz, or any third-party tab/window/site
  // activity — and end the attempt on their very FIRST occurrence (not
  // after a counted limit). This decision is made here, server-side, from
  // the reason string alone; a `hard` flag the client sends is informational
  // only and never trusted, so a tampered client can't downgrade its own
  // severity.
  //
  // COUNTED_REASONS still increment violations_count for the admin's
  // Security Log / Live Monitor, and (for any reason NOT in HARD_REASONS)
  // still respect the quiz's configurable tab-switch limit as before.
  // Softer signals not in either set (window focus loss is now hard — see
  // below — blocked shortcuts, clipboard, context menu...) are logged and
  // pushed to admins in real time, but never end the attempt on their own.
  //
  // `quiz.auto_submit` remains the admin's single overall on/off switch for
  // automatic proctoring enforcement (e.g. disabled for a practice/demo
  // quiz) — turning it off disables force-logout entirely, hard or soft,
  // exactly as before.
  const HARD_REASONS = new Set([
    "tab_switch",
    "window_blur",
    "fullscreen_exit",
    "navigation_attempt",
    "new_tab_blocked",
    "devtools_attempt",
    "screenshot_attempt",
  ]);
  const COUNTED_REASONS = new Set([
    "tab_switch",
    "window_blur",
    "fullscreen_exit",
    "new_tab_blocked",
    "devtools_attempt",
    "navigation_attempt",
    "screenshot_attempt",
  ]);
  const reason = String((req.body || {}).reason || "tab_switch").slice(0, 60);
  const hard = HARD_REASONS.has(reason);
  const counted = COUNTED_REASONS.has(reason);

  const nextCount = (attempt.violations_count || 0) + (counted ? 1 : 0);
  if (counted) {
    await supabase.from("quiz_attempts").update({ violations_count: nextCount }).eq("id", attempt.id);
  }

  emitAdmin("proctor:event", {
    quizId: quiz.id,
    attemptId: attempt.id,
    studentId: req.student.studentId,
    reason,
    hard,
    counted,
    violationsCount: nextCount,
    at: new Date().toISOString(),
  });

  const limitReached = quiz.auto_submit && (hard || (counted && nextCount >= quiz.tab_switch_limit));
  let autoSubmitted = false;
  let logoutMessage = null;
  if (limitReached) {
    const refreshed = { ...attempt, violations_count: nextCount };
    await finalizeAttempt(supabase, refreshed, quiz, "auto_submitted");
    autoSubmitted = true;
    logoutMessage = logoutMessageFor(reason, { hard, limit: quiz.tab_switch_limit });
    await recordLogoutEvent(supabase, {
      studentId: req.student.studentId,
      quizId: quiz.id,
      quizTitle: quiz.title,
      reason,
      message: logoutMessage,
      details: { violationsCount: nextCount, limit: quiz.tab_switch_limit, hard, attemptId: attempt.id },
    });
  }

  res.json({
    success: true,
    violationsCount: nextCount,
    limit: quiz.tab_switch_limit,
    reason,
    hard,
    counted,
    limitReached,
    autoSubmitted,
    logoutReason: autoSubmitted ? reason : null,
    logoutMessage,
  });
});

// POST /api/quizzes/:id/round/complete  { roundId }
// Called by the student app the moment a round's last question is finished.
// Grades that round only and decides whether the student may continue. When
// they fall short of the round's qualification percentage the attempt is
// finalized immediately and the final scoreboard is returned.
const completeRound = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const { roundId } = req.body || {};
  if (!roundId) throw new ApiError(400, "roundId is required");

  const supabase = getSupabase();
  const [{ data: attempt }, { data: quiz }] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("*")
      .eq("quiz_id", req.params.id)
      .eq("student_id", req.student.studentId)
      .eq("status", "in_progress")
      .maybeSingle(),
    supabase.from("quizzes").select("*").eq("id", req.params.id).maybeSingle(),
  ]);
  if (!quiz) throw new ApiError(404, "Quiz not found");
  if (!attempt) throw new ApiError(404, "No active attempt found");

  const rounds = await loadQuizRounds(supabase, quiz.id);
  const round = rounds.find((r) => r.id === roundId);
  if (!round) throw new ApiError(404, "Round not found for this quiz");

  const [questions, answersMap] = await Promise.all([
    loadQuizQuestions(supabase, quiz.id),
    loadAnswersMap(supabase, attempt.id),
  ]);
  const outcome = evaluateRound(round, questions, answersMap);

  if (outcome.qualified) {
    return res.json({ success: true, roundOutcome: outcome, finished: false });
  }

  // Not qualified — the attempt ends here with a final scoreboard.
  const { attempt: finalized } = await finalizeAttempt(supabase, attempt, quiz, "submitted");
  const [ranking, review] = await Promise.all([
    rankForAttempt(supabase, quiz.id, finalized.id),
    reviewForAttempt(supabase, quiz.id, finalized.id, finalized.question_order),
  ]);

  res.json({
    success: true,
    finished: true,
    roundOutcome: outcome,
    message: "You have finished.",
    result: {
      ...shapeResult(finalized),
      quizTitle: quiz.title,
      ...ranking,
      review,
      finishedEarly: true,
      roundOutcome: outcome,
    },
  });
});

// POST /api/quizzes/:id/submit
const submitAttempt = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const supabase = getSupabase();

  const [{ data: attempt }, { data: quiz }] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("*")
      .eq("quiz_id", req.params.id)
      .eq("student_id", req.student.studentId)
      .eq("status", "in_progress")
      .maybeSingle(),
    supabase.from("quizzes").select("*").eq("id", req.params.id).maybeSingle(),
  ]);
  if (!quiz) throw new ApiError(404, "Quiz not found");
  if (!attempt) {
    // Already submitted (e.g. double click) — return the existing result idempotently.
    const { data: existing } = await supabase
      .from("quiz_attempts")
      .select("*")
      .eq("quiz_id", req.params.id)
      .eq("student_id", req.student.studentId)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!existing) throw new ApiError(404, "No attempt found");
    const [ranking, review] = await Promise.all([
      rankForAttempt(supabase, quiz.id, existing.id),
      reviewForAttempt(supabase, quiz.id, existing.id, existing.question_order),
    ]);
    return res.json({
      success: true,
      result: { ...shapeResult(existing), quizTitle: quiz.title, ...ranking, review },
    });
  }

  const { attempt: finalized } = await finalizeAttempt(supabase, attempt, quiz, "submitted");
  const [ranking, review] = await Promise.all([
    rankForAttempt(supabase, quiz.id, finalized.id),
    reviewForAttempt(supabase, quiz.id, finalized.id, finalized.question_order),
  ]);
  res.json({
    success: true,
    result: { ...shapeResult(finalized), quizTitle: quiz.title, ...ranking, review },
  });
});

function shapeResult(a) {
  return {
    attemptId: a.id,
    status: a.status,
    totalMarks: a.total_marks,
    obtainedMarks: a.obtained_marks,
    percentage: a.percentage,
    correct: a.correct_count,
    wrong: a.wrong_count,
    unanswered: a.unanswered_count,
    passed: a.passed,
    startedAt: a.started_at,
    submittedAt: a.submitted_at,
    // Completion time, recorded for every attempt — also the leaderboard
    // tie-breaker when two students share the same score.
    timeTakenSeconds: timeTakenSeconds(a),
  };
}

// Rank of one attempt within its quiz, using exactly the same rules as the
// leaderboard and the admin results page (score first, then the shorter
// completion time).
async function rankForAttempt(supabase, quizId, attemptId) {
  const { data } = await supabase
    .from("quiz_attempts")
    .select("id, obtained_marks, started_at, submitted_at")
    .eq("quiz_id", quizId)
    .in("status", ["submitted", "auto_submitted"]);
  const ranked = rankAttempts(data || []);
  const mine = ranked.find((a) => a.id === attemptId);
  return { rank: mine ? mine.__rank : null, totalParticipants: ranked.length };
}

// Post-submission review of every question the student did not get right.
async function reviewForAttempt(supabase, quizId, attemptId, questionOrder) {
  const questions = await loadQuizQuestions(supabase, quizId);
  // Number the questions exactly as the student saw them (their attempt order)
  // so "Question 3" in the review is the question they answered third.
  const order = Array.isArray(questionOrder) ? questionOrder : [];
  if (order.length) {
    const rank = new Map(order.map((id, i) => [id, i]));
    questions.sort(
      (a, b) => (rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER) -
        (rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER)
    );
  }
  const { data: answers } = await supabase
    .from("answers")
    .select(await answerColumns())
    .eq("attempt_id", attemptId);
  const answersMap = new Map(
    (answers || []).map((a) => [
      a.question_id,
      { optionId: a.selected_option_id, code: a.code_answer, blanks: a.blank_answer, judge: a.judge_result || null },
    ])
  );
  return buildAnswerReview(questions, answersMap);
}

// GET /api/quizzes/:id/result — the current student's latest result for this quiz
const myResult = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const supabase = getSupabase();
  const { data: attempt, error } = await supabase
    .from("quiz_attempts")
    .select("*, quizzes(title, max_marks)")
    .eq("quiz_id", req.params.id)
    .eq("student_id", req.student.studentId)
    .in("status", ["submitted", "auto_submitted"])
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new ApiError(500, "Failed to load result", error.message);
  if (!attempt) throw new ApiError(404, "No submitted attempt found for this quiz");

  const [ranking, review] = await Promise.all([
    rankForAttempt(supabase, req.params.id, attempt.id),
    reviewForAttempt(supabase, req.params.id, attempt.id, attempt.question_order),
  ]);

  res.json({
    success: true,
    result: { ...shapeResult(attempt), quizTitle: attempt.quizzes?.title, ...ranking, review },
  });
});

// GET /api/quizzes/:id/leaderboard — public if the quiz allows it
const leaderboard = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, show_leaderboard")
    .eq("id", req.params.id)
    .maybeSingle();
  if (!quiz) throw new ApiError(404, "Quiz not found");
  if (!quiz.show_leaderboard) throw new ApiError(403, "Leaderboard is not public for this quiz");

  const { data: attempts, error } = await supabase
    .from("quiz_attempts")
    .select("id, obtained_marks, percentage, started_at, submitted_at, students(name, register_number)")
    .eq("quiz_id", quiz.id)
    .in("status", ["submitted", "auto_submitted"]);
  if (error) throw new ApiError(500, "Failed to load leaderboard", error.message);

  // Highest score first; equal scores are broken by who took less time.
  const ranked = rankAttempts(attempts || []).map((a) => ({
    attemptId: a.id,
    rank: a.__rank,
    name: a.students?.name,
    registerNumber: a.students?.register_number,
    score: a.obtained_marks,
    percentage: a.percentage,
    submittedAt: a.submitted_at,
    timeTakenSeconds: timeTakenSeconds(a),
  }));

  res.json({ success: true, quizTitle: quiz.title, leaderboard: ranked });
});

// ---------------------------------------------------------------------------
// Programming questions: Run (sample tests only) and Submit (hidden tests).
// Both execute inside the remote sandbox — never on this server — and the
// hidden answer key is only ever compared server-side.
// ---------------------------------------------------------------------------

async function loadCodingContext(req, questionId) {
  if (!questionId) throw new ApiError(400, "questionId is required");
  const supabase = getSupabase();
  const [{ data: attempt }, { data: quiz }] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("*")
      .eq("quiz_id", req.params.id)
      .eq("student_id", req.student.studentId)
      .eq("status", "in_progress")
      .maybeSingle(),
    supabase.from("quizzes").select("*").eq("id", req.params.id).maybeSingle(),
  ]);
  if (!quiz) throw new ApiError(404, "Quiz not found");
  if (!attempt) throw new ApiError(404, "No active attempt found");
  if (Date.now() > deadlineFor(attempt, quiz)) {
    await finalizeAttempt(supabase, attempt, quiz, "auto_submitted");
    throw new ApiError(410, "Time is up — this attempt has been auto-submitted");
  }

  // ROOT CAUSE FIX: fetchQuestion() only selects id/quiz_id/round_id/time_limit_seconds,
  // so question_type (and the judge columns: test_cases, sample_io, expected_output,
  // allowed_languages, time_limit_ms) were always undefined here — every Run/Submit
  // failed with "This question is not a programming question". Load the whole row.
  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select("*")
    .eq("id", questionId)
    .maybeSingle();
  if (questionError) throw new ApiError(500, "Failed to load question", questionError.message);
  if (!question || question.quiz_id !== quiz.id) {
    throw new ApiError(404, "Question does not belong to this quiz");
  }
  const type = String(question.question_type || "").toLowerCase();
  if (!["coding", "programming", "code"].includes(type)) {
    throw new ApiError(400, "This question is not a programming question");
  }
  return { supabase, attempt, quiz, question };
}

function resolveLanguage(question, requested) {
  const allowed =
    Array.isArray(question.allowed_languages) && question.allowed_languages.length
      ? question.allowed_languages
      : question.language
        ? [question.language]
        : SUPPORTED_LANGUAGES;
  const language = String(requested || allowed[0] || "python").toLowerCase();
  // The judge only knows C, C++, Java and Python — anything else is a real
  // configuration error. A language the judge supports but the admin did not
  // list is NOT an error worth blocking a run over: fall back to the first
  // allowed language instead of failing the request.
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw new ApiError(400, `Language "${language}" is not supported. Use C, C++, Java or Python.`);
  }
  // Never silently swap languages: compiling C++ source with the Python
  // toolchain produced bogus "SyntaxError" output. Any judge-supported
  // language the student picked is run as that language; the admin's allowed
  // list only decides the default selection.
  return language;
}

// Turns any judge result into a plain-text transcript for the student's
// terminal panel, so compile errors / runtime errors / TLE are always visible
// instead of surfacing as a bare failed request.
function terminalFor({ language, stdin, run }) {
  const lines = [`$ run (${language})`];
  if (String(stdin ?? "").trim()) lines.push(`stdin:\n${stdin}`);
  if (run.compileOutput) lines.push(`compiler:\n${run.compileOutput}`);
  if (run.stdout) lines.push(run.stdout.replace(/\n$/, ""));
  if (run.stderr) lines.push(`stderr:\n${run.stderr.replace(/\n$/, "")}`);
  if (run.message) lines.push(run.message);
  if (!run.stdout && !run.stderr && !run.compileOutput && !run.message) lines.push("(no output)");
  lines.push(
    run.status === "ok"
      ? `\n[finished${run.timeMs != null ? ` in ${run.timeMs} ms` : ""}]`
      : `\n[${run.status}]`
  );
  return lines.join("\n");
}

// Per-language floor for the wall clock. The limit is meant to bound the
// student's ALGORITHM, not the interpreter/JVM start-up cost, so a 1000 ms
// question must not report "Time Limit Exceeded" just because the JVM needs
// ~700 ms to boot. Runtime discovery and compilation are budgeted separately
// in localRunner.js and never counted here.
const LANGUAGE_TIME_FLOOR_MS = { python: 3000, c: 2000, cpp: 2000, java: 6000 };

function effectiveTimeLimit(language, question) {
  const configured = Number(question.time_limit_ms) > 0 ? Number(question.time_limit_ms) : 3000;
  return Math.max(configured, LANGUAGE_TIME_FLOOR_MS[language] || 3000);
}

// Run: student-driven testing. Uses ad-hoc stdin, or the visible sample I/O.
// Never touches marks and never reveals hidden cases.
const runCode = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const { questionId, code, language: requested, stdin } = req.body || {};
  if (!code || !String(code).trim()) throw new ApiError(400, "code is required");

  const { question } = await loadCodingContext(req, questionId);
  const language = resolveLanguage(question, requested);
  const timeLimitMs = effectiveTimeLimit(language, question);

  const samples = (Array.isArray(question.sample_io) ? question.sample_io : []).map((sample, i) => ({
    name: `Sample ${i + 1}`,
    input: sample.input ?? "",
    expectedOutput: sample.output ?? "",
    hidden: false,
  }));

  // Explicit stdin (even an empty string) always wins — that is the student
  // asking "run my program with exactly this input".
  const useStdin = typeof stdin === "string" || !samples.length;
  const { signal, cleanup } = abortSignalForRequest(req, res);
  try {
    if (useStdin) {
      const input = typeof stdin === "string" ? stdin : "";
      const run = await executeCode({ language, source: code, stdin: input, timeLimitMs, signal });
      if (res.writableEnded || res.destroyed) return;
      return res.json({
        success: true,
        mode: "stdin",
        language,
        stdin: input,
        run,
        terminal: terminalFor({ language, stdin: input, run }),
      });
    }

    const verdict = await runTestCases({
      language,
      source: code,
      testCases: samples,
      timeLimitMs,
      revealAll: true, // samples are public by definition
      signal,
    });
    if (res.writableEnded || res.destroyed) return;
    const terminal = [`$ run ${samples.length} sample case(s) (${language})`]
      .concat(
        (verdict.results || []).map((c) => {
          const parts = [`— ${c.name}: ${c.passed ? "passed" : c.status === "ok" ? "wrong answer" : c.status}`];
          if (c.input) parts.push(`input:\n${c.input}`);
          if (c.actualOutput) parts.push(`output:\n${c.actualOutput.replace(/\n$/, "")}`);
          if (c.expectedOutput) parts.push(`expected:\n${String(c.expectedOutput).replace(/\n$/, "")}`);
          if (c.stderr) parts.push(`stderr:\n${c.stderr.replace(/\n$/, "")}`);
          if (c.message) parts.push(c.message);
          return parts.join("\n");
        })
      )
      .concat([
        verdict.compileOutput ? `compiler:\n${verdict.compileOutput}` : null,
        `\n[${verdict.passed}/${verdict.total} sample cases passed]`,
      ].filter(Boolean))
      .join("\n\n");
    res.json({ success: true, mode: "samples", language, ...verdict, terminal });
  } finally {
    cleanup();
  }
});

// Submit: authoritative grading run against every test case (hidden included).
// The verdict is persisted on the answer row so final scoring is deterministic
// and cannot be influenced by anything the client sends later.
const submitCode = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const { questionId, code, language: requested } = req.body || {};
  if (!code || !String(code).trim()) throw new ApiError(400, "code is required");

  const { supabase, attempt, question } = await loadCodingContext(req, questionId);
  const language = resolveLanguage(question, requested);
  const supportsJudge = await codingJudgeSupported();

  const testCases = Array.isArray(question.test_cases) ? question.test_cases : [];
  const timeLimitMs = effectiveTimeLimit(language, question);
  const { signal, cleanup } = abortSignalForRequest(req, res);
  let verdict;
  let plainRun = null;
  try {
    verdict = await runTestCases({
      language,
      source: code,
      testCases,
      timeLimitMs,
      expectedOutput: question.expected_output,
      signal,
    });

    // A question with no test cases and no expected output cannot be judged.
    // Still compile and run the code once so the student sees a real terminal
    // transcript (and any compile/runtime error) instead of a silent submit.
    if (verdict.status === "no_tests") {
      const sample = (Array.isArray(question.sample_io) ? question.sample_io : [])[0];
      plainRun = await executeCode({
        language,
        source: code,
        stdin: sample?.input ?? "",
        timeLimitMs,
        signal,
      });
    }
  } finally {
    cleanup();
  }

  // The student cancelled (or disconnected) before grading finished — never
  // persist a partial/interrupted verdict as their official submission, and
  // there's no client left to send a response to anyway.
  if (verdict.status === "aborted" || plainRun?.status === "aborted" || res.writableEnded || res.destroyed) {
    return;
  }

  const judge = {
    status: verdict.status === "no_tests" && plainRun ? plainRun.status : verdict.status,
    passed: verdict.passed,
    total: verdict.total,
    language,
    message: verdict.message || plainRun?.message || null,
    judgedAt: new Date().toISOString(),
    // Per-case verdicts, already redacted by the judge (see codeRunner.js):
    // hidden cases the student passed stay fully hidden, hidden cases the
    // student failed reveal only Input/Expected Output, sample cases stay
    // fully visible. Persisted so the same detail survives into later
    // result views, not just this immediate response.
    cases: verdict.results || [],
  };

  const { error } = await supabase.from("answers").upsert(
    {
      attempt_id: attempt.id,
      question_id: question.id,
      selected_option_id: null,
      code_answer: code,
      blank_answer: null,
      ...(supportsJudge ? { judge_result: judge, language } : {}),
      answered_at: new Date().toISOString(),
    },
    { onConflict: "attempt_id,question_id" }
  );
  if (error) throw new ApiError(500, "Failed to save submission", error.message);

  const terminal = plainRun
    ? terminalFor({ language, stdin: "", run: plainRun })
    : [
        `$ submit (${language})`,
        verdict.compileOutput ? `compiler:\n${verdict.compileOutput}` : null,
        ...(verdict.results || []).map((c) => {
          const parts = [
            `— ${c.name}: ${c.passed ? "passed" : c.status === "ok" ? "wrong answer" : c.status}` +
              (c.hidden ? " (hidden)" : ""),
          ];
          // Only populated when the case is a visible sample, or a hidden
          // case the student just failed — never for a hidden case they passed.
          if (c.input != null) parts.push(`input:\n${c.input}`);
          if (c.expectedOutput != null) parts.push(`expected:\n${c.expectedOutput}`);
          if (c.stderr) parts.push(`stderr:\n${c.stderr.replace(/\n$/, "")}`);
          return parts.join("\n");
        }),
        verdict.message || null,
        `\n[${verdict.passed}/${verdict.total} test cases passed]`,
      ]
        .filter(Boolean)
        .join("\n\n");

  res.json({
    success: true,
    // Marks are intentionally not returned here — the student sees them with
    // the rest of the result after the quiz is submitted.
    judge: summarizeJudge(judge),
    results: verdict.results, // hidden cases are already redacted by the judge
    run: plainRun,
    terminal,
  });
});

module.exports = {
  activateQuestion,
  startAttempt,
  saveAnswer,
  runCode,
  submitCode,
  logViolation,
  completeRound,
  submitAttempt,
  myResult,
  leaderboard,
  // Exported for reuse by the Dashboard's account-token-based attempt
  // detail endpoint (see studentResults routes) — the account session
  // doesn't carry a quizId the way a per-quiz session token does, so that
  // endpoint authorizes by student ownership instead of ensureOwnQuiz, but
  // still wants the exact same question-loading / answer-column logic.
  loadQuizQuestions,
  answerColumns,
};
