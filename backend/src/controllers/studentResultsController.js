const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { buildFullAnswerReview } = require("../utils/answerReview");
const { loadQuizQuestions, answerColumns } = require("./quizAttemptController");

// GET /api/student/results — every submitted result for the signed-in
// student (Dashboard: "attended quizzes" list + cumulative percentage).
const listMyResults = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("quiz_attempts")
    .select("*, quizzes(title, max_marks)")
    .eq("student_id", req.student.studentId)
    .in("status", ["submitted", "auto_submitted"])
    .order("submitted_at", { ascending: false });
  if (error) throw new ApiError(500, "Failed to load results", error.message);

  const results = (data || []).map((a) => ({
    attemptId: a.id,
    quizId: a.quiz_id,
    quizTitle: a.quizzes?.title,
    totalMarks: a.total_marks,
    obtainedMarks: a.obtained_marks,
    percentage: a.percentage,
    passed: a.passed,
    correct: a.correct_count,
    wrong: a.wrong_count,
    unanswered: a.unanswered_count,
    submittedAt: a.submitted_at,
  }));

  // Cumulative percentage across every attended quiz — the simple average
  // of each attempt's own percentage, so every quiz counts equally
  // regardless of how many marks it was out of.
  const cumulativePercentage = results.length
    ? Math.round(
        (results.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0) / results.length) * 100
      ) / 100
    : null;

  res.json({
    success: true,
    results,
    cumulativePercentage,
    quizzesAttended: results.length,
  });
});

// GET /api/student/results/:attemptId — full saved/submitted answers (incl.
// code) for one of the signed-in student's own attempts. Distinct from
// GET /api/quizzes/:id/result (myResult), which is used mid-flow right after
// a quiz is submitted and requires the per-quiz session token; this one is
// for the Dashboard, works off the account token, and is authorized purely
// by attempt ownership (student_id) since an account token has no quizId.
const getMyAttemptDetail = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { data: attempt, error } = await supabase
    .from("quiz_attempts")
    .select("*, quizzes(title, max_marks)")
    .eq("id", req.params.attemptId)
    .eq("student_id", req.student.studentId)
    .in("status", ["submitted", "auto_submitted"])
    .maybeSingle();
  if (error) throw new ApiError(500, "Failed to load attempt", error.message);
  if (!attempt) throw new ApiError(404, "Attempt not found");

  const questions = await loadQuizQuestions(supabase, attempt.quiz_id);
  const order = Array.isArray(attempt.question_order) ? attempt.question_order : [];
  if (order.length) {
    const rank = new Map(order.map((id, i) => [id, i]));
    questions.sort(
      (a, b) =>
        (rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER) -
        (rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER)
    );
  }

  const { data: answers } = await supabase
    .from("answers")
    .select(await answerColumns())
    .eq("attempt_id", attempt.id);
  const answersMap = new Map(
    (answers || []).map((a) => [
      a.question_id,
      { optionId: a.selected_option_id, code: a.code_answer, blanks: a.blank_answer, judge: a.judge_result || null },
    ])
  );

  res.json({
    success: true,
    attempt: {
      attemptId: attempt.id,
      quizId: attempt.quiz_id,
      quizTitle: attempt.quizzes?.title,
      totalMarks: attempt.total_marks,
      obtainedMarks: attempt.obtained_marks,
      percentage: attempt.percentage,
      passed: attempt.passed,
      submittedAt: attempt.submitted_at,
    },
    questions: buildFullAnswerReview(questions, answersMap),
  });
});

module.exports = { listMyResults, getMyAttemptDetail };
