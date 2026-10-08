const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { rankAttempts } = require("../utils/ranking");

// Older databases may not have students.mobile_number yet (same guard used
// in studentController.js). Detect that specific error and fall back to a
// select without the column so Results never breaks before the migration
// (backend/sql/migration_student_mobile.sql) is applied.
const isMissingMobileColumn = (error) =>
  Boolean(error) && /mobile_number/i.test(`${error.message || ""} ${error.details || ""}`);

const ATTEMPT_SELECT_WITH_MOBILE =
  "*, quizzes(id, title), students(id, name, register_number, department, year, section, mobile_number)";
const ATTEMPT_SELECT_WITHOUT_MOBILE =
  "*, quizzes(id, title), students(id, name, register_number, department, year, section)";

function resultRow(a) {
  return {
    attemptId: a.id,
    rank: a.__rank ?? null,
    quiz: a.quizzes ? { id: a.quizzes.id, title: a.quizzes.title } : null,
    student: a.students,
    status: a.status,
    totalMarks: a.total_marks,
    obtainedMarks: a.obtained_marks,
    percentage: a.percentage,
    correct: a.correct_count,
    wrong: a.wrong_count,
    unanswered: a.unanswered_count,
    passed: a.passed,
    violations: a.violations_count,
    startedAt: a.started_at,
    submittedAt: a.submitted_at,
    totalQuestions:
      Number(a.correct_count || 0) + Number(a.wrong_count || 0) + Number(a.unanswered_count || 0),
    timeTakenSeconds:
      a.submitted_at && a.started_at
        ? Math.max(0, Math.round((new Date(a.submitted_at) - new Date(a.started_at)) / 1000))
        : null,
  };
}

// Ranks attempts within each quiz, then returns them in ranked order
// (grouped per quiz, quizzes keep the order they first appear in).
function rankPerQuiz(attempts) {
  const groups = new Map();
  attempts.forEach((a) => {
    const key = a.quiz_id || a.quizzes?.id || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  });
  return [...groups.values()].flatMap((rows) => rankAttempts(rows));
}

const listResults = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { quizId } = req.query;

  let query = supabase
    .from("quiz_attempts")
    .select(ATTEMPT_SELECT_WITH_MOBILE)
    .in("status", ["submitted", "auto_submitted"]);

  if (quizId) query = query.eq("quiz_id", quizId);

  let { data, error } = await query;
  if (error && isMissingMobileColumn(error)) {
    let fallbackQuery = supabase
      .from("quiz_attempts")
      .select(ATTEMPT_SELECT_WITHOUT_MOBILE)
      .in("status", ["submitted", "auto_submitted"]);
    if (quizId) fallbackQuery = fallbackQuery.eq("quiz_id", quizId);
    ({ data, error } = await fallbackQuery);
  }
  if (error) throw new ApiError(500, "Failed to load results", error.message);

  // Same ranking rules as the leaderboard: score first, earlier completion
  // time breaks ties. Ranks are per quiz.
  const results = rankPerQuiz(data || []).map(resultRow);
  const scores = results.map((r) => Number(r.percentage) || 0);
  const summary = {
    count: results.length,
    highestScore: scores.length ? Math.max(...scores) : 0,
    averageScore: scores.length ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10 : 0,
    passCount: results.filter((r) => r.passed).length,
    failCount: results.filter((r) => !r.passed).length,
    passPercentage: results.length
      ? Math.round((results.filter((r) => r.passed).length / results.length) * 1000) / 10
      : 0,
  };

  res.json({ success: true, results, summary });
});

const getResultDetail = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  let { data: attempt, error } = await supabase
    .from("quiz_attempts")
    .select(ATTEMPT_SELECT_WITH_MOBILE)
    .eq("id", req.params.attemptId)
    .maybeSingle();
  if (error && isMissingMobileColumn(error)) {
    ({ data: attempt, error } = await supabase
      .from("quiz_attempts")
      .select(ATTEMPT_SELECT_WITHOUT_MOBILE)
      .eq("id", req.params.attemptId)
      .maybeSingle());
  }
  if (error) throw new ApiError(500, "Failed to load result", error.message);
  if (!attempt) throw new ApiError(404, "Result not found");

  const { data: answers } = await supabase
    .from("answers")
    .select("question_id, selected_option_id, code_answer, blank_answer, marks_awarded, judge_result, language")
    .eq("attempt_id", attempt.id);

  const { data: allQuestions } = await supabase
    .from("questions")
    .select(
      "id, question_text, marks, order_index, question_type, language, blank_answers, quiz_options(id, option_text, is_correct), problem_statement, expected_output, reference_solution, sample_io, test_cases, allowed_languages"
    )
    .eq("quiz_id", attempt.quiz_id)
    .order("order_index", { ascending: true });

  const answerByQuestion = Object.fromEntries((answers || []).map((a) => [a.question_id, a]));

  const questionBreakdown = (allQuestions || []).map((q) => {
    const ans = answerByQuestion[q.id];
    const type = q.question_type || "mcq";

    if (type === "coding") {
      const marksAwarded = Number(ans?.marks_awarded ?? 0);
      return {
        questionId: q.id,
        type: "coding",
        text: q.question_text,
        marks: q.marks,
        language: ans?.language || q.language,
        submittedCode: ans?.code_answer ?? null,
        // Reference material so the admin can compare the student's code with
        // the intended answer: expected output, the sample cases and the
        // (hidden) test cases with their expected outputs, plus the judge
        // verdict recorded when the student submitted.
        problemStatement: q.problem_statement ?? null,
        expectedOutput: q.expected_output ?? null,
        referenceSolution: q.reference_solution ?? null,
        sampleIo: Array.isArray(q.sample_io) ? q.sample_io : [],
        testCases: Array.isArray(q.test_cases)
          ? q.test_cases.map((t, i) => ({
              name: t?.name || `Test case ${i + 1}`,
              input: t?.input ?? "",
              expectedOutput: t?.expected_output ?? t?.expectedOutput ?? "",
              hidden: t?.hidden ?? true,
            }))
          : [],
        judge: ans?.judge_result ?? null,
        marksAwarded,
        isCorrect: marksAwarded >= Number(q.marks) && Number(q.marks) > 0,
        isPartial: marksAwarded > 0 && marksAwarded < Number(q.marks),
        answered: !!ans?.code_answer,
      };
    }

    if (type === "fill_blank") {
      const marksAwarded = Number(ans?.marks_awarded ?? 0);
      return {
        questionId: q.id,
        type: "fill_blank",
        text: q.question_text,
        marks: q.marks,
        submittedBlanks: ans?.blank_answer ?? null,
        correctBlanks: q.blank_answers ?? null,
        marksAwarded,
        isCorrect: marksAwarded >= Number(q.marks) && Number(q.marks) > 0,
        isPartial: marksAwarded > 0 && marksAwarded < Number(q.marks),
        answered: Array.isArray(ans?.blank_answer) && ans.blank_answer.some((b) => String(b || "").trim()),
      };
    }

    const correctOption = q.quiz_options.find((o) => o.is_correct);
    const selectedOption = ans ? q.quiz_options.find((o) => o.id === ans.selected_option_id) : null;
    return {
      questionId: q.id,
      type: "mcq",
      text: q.question_text,
      marks: q.marks,
      correctOption: correctOption?.option_text ?? null,
      selectedOption: selectedOption?.option_text ?? null,
      isCorrect: !!selectedOption && selectedOption.id === correctOption?.id,
      marksAwarded: ans?.marks_awarded !== null && ans?.marks_awarded !== undefined ? Number(ans.marks_awarded) : null,
      answered: !!ans,
    };
  });

  res.json({ success: true, result: resultRow(attempt), questionBreakdown });
});

/**
 * Delete ONE participant's result (attempt) from a quiz.
 * DELETE /api/admin/results/:attemptId
 *
 * Removes the attempt, its answers and the matching attendance row for that
 * student + quiz, so the participant disappears from the Results list.
 * Nothing else (quiz, questions, other students) is touched.
 */
const deleteResult = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { attemptId } = req.params;
  if (!attemptId) throw new ApiError(400, "Attempt id is required");

  const { data: attempt, error: findError } = await supabase
    .from("quiz_attempts")
    .select("id, quiz_id, student_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (findError) throw new ApiError(500, "Failed to load result", findError.message);
  if (!attempt) throw new ApiError(404, "Result not found or already deleted");

  // Answers first (they reference the attempt).
  const { error: answersError } = await supabase.from("answers").delete().eq("attempt_id", attempt.id);
  if (answersError) throw new ApiError(500, "Failed to delete result answers", answersError.message);

  const { error: deleteError } = await supabase.from("quiz_attempts").delete().eq("id", attempt.id);
  if (deleteError) throw new ApiError(500, "Failed to delete result", deleteError.message);

  // Best-effort: drop the participation row too, so the student no longer
  // shows up as a participant of this quiz. Missing table/row is not an error.
  if (attempt.student_id != null && attempt.quiz_id != null) {
    await supabase
      .from("attendance")
      .delete()
      .eq("quiz_id", attempt.quiz_id)
      .eq("student_id", attempt.student_id);
  }

  res.json({ success: true, deletedId: attempt.id });
});

module.exports = { listResults, getResultDetail, deleteResult };

