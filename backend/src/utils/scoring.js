const { evaluateSubmission, evaluateFillBlank } = require("./codeValidator");

/**
 * Grades a single question given the student's answer for it.
 * answer shape: { optionId } for MCQ, { code } for coding, { blanks } for
 * fill-in-the-blank, or undefined/null if unanswered.
 */
function negativeFor(question) {
  const negative = Number(question.negative_marks || 0);
  return Number.isFinite(negative) && negative > 0 ? negative : 0;
}

function roundMarks(value) {
  return Math.round(Number(value) * 100) / 100;
}

// Turns the judge verdict stored on the answer row (answers.judge_result,
// written when the student pressed Submit / at finalization) into an outcome.
function outcomeFromJudge(judge) {
  const total = Number(judge.total || 0);
  const passed = Number(judge.passed || 0);
  if (judge.status === "hardcoded") return { outcome: "wrong", ratio: 0 };
  if (judge.status === "judge_unavailable" || judge.status === "no_tests") return null;
  if (total <= 0) return null;
  if (passed >= total) return { outcome: "correct", ratio: 1 };
  if (passed > 0) return { outcome: "partial", ratio: passed / total };
  return { outcome: "wrong", ratio: 0 };
}

function gradeQuestion(question, answer) {
  if (question.question_type === "coding") {
    const code = answer && answer.code;
    if (!code || !String(code).trim()) {
      return { outcome: "unanswered", marksAwarded: 0 };
    }

    // Preferred path: the sandboxed judge already ran this submission against
    // the hidden test cases and the verdict is stored on the answer row.
    const judge = answer && answer.judge;
    const fromJudge = judge ? outcomeFromJudge(judge) : null;
    const { outcome, ratio } =
      fromJudge ||
      // Fallback for questions with no test cases (or an unreachable judge):
      // the legacy expected-output / reference-solution comparison.
      evaluateSubmission({
        submittedCode: code,
        expectedOutput: question.expected_output,
        referenceSolution: question.reference_solution,
      });

    if (outcome === "unanswered") return { outcome, marksAwarded: 0 };
    if (outcome === "wrong") return { outcome, marksAwarded: -negativeFor(question) };
    return { outcome, marksAwarded: roundMarks(Number(question.marks) * ratio) };
  }

  if (question.question_type === "fill_blank") {
    const blanks = answer && answer.blanks;
    const { outcome, ratio } = evaluateFillBlank({
      submittedBlanks: blanks,
      blankAnswers: question.blank_answers,
      caseSensitive: question.case_sensitive,
    });
    if (outcome === "unanswered") return { outcome, marksAwarded: 0 };
    if (outcome === "wrong") return { outcome, marksAwarded: -negativeFor(question) };
    return { outcome, marksAwarded: roundMarks(Number(question.marks) * ratio) };
  }

  // MCQ (default)
  const selectedOptionId = answer && answer.optionId;
  if (selectedOptionId === null || selectedOptionId === undefined) {
    return { outcome: "unanswered", marksAwarded: 0 };
  }
  const correctOption = (question.quiz_options || []).find((o) => o.is_correct);
  const isCorrect = correctOption && correctOption.id === selectedOptionId;

  if (isCorrect) {
    return { outcome: "correct", marksAwarded: Number(question.marks) };
  }
  return { outcome: "wrong", marksAwarded: -negativeFor(question) };
}

// A "partial" coding outcome still counts toward correct/wrong stats using
// a 50%-of-marks threshold, so existing correct/wrong/unanswered reporting
// (dashboards, CSV export, pass/fail) keeps working unchanged. The actual
// score itself always reflects the exact partial credit, regardless of bucket.
function statsBucketFor(outcome, marksAwarded, fullMarks) {
  if (outcome === "unanswered") return "unanswered";
  if (outcome === "correct") return "correct";
  if (outcome === "partial") {
    return Number(fullMarks) > 0 && marksAwarded / Number(fullMarks) >= 0.5 ? "correct" : "wrong";
  }
  return "wrong";
}

/**
 * questions: array of question rows (each with .quiz_options[] for MCQ,
 *   and .question_type / .expected_output / .reference_solution for coding)
 * answersByQuestionId: Map<questionId, { optionId } | { code }>
 */
function gradeAttempt(questions, answersByQuestionId) {
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  let obtainedMarks = 0;
  let totalMarks = 0;
  const perQuestion = [];

  for (const q of questions) {
    totalMarks += Number(q.marks);
    const answer = answersByQuestionId.has(q.id) ? answersByQuestionId.get(q.id) : null;
    const { outcome, marksAwarded } = gradeQuestion(q, answer);

    const bucket = statsBucketFor(outcome, marksAwarded, q.marks);
    if (bucket === "correct") correct += 1;
    else if (bucket === "wrong") wrong += 1;
    else unanswered += 1;

    obtainedMarks += marksAwarded;
    perQuestion.push({
      questionId: q.id,
      selectedOptionId: answer && answer.optionId !== undefined ? answer.optionId : null,
      outcome,
      marksAwarded,
    });
  }

  // Marks should not go below zero overall due to negative marking.
  if (obtainedMarks < 0) obtainedMarks = 0;

  const percentage = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;

  return {
    correct,
    wrong,
    unanswered,
    totalMarks,
    obtainedMarks: Math.round(obtainedMarks * 100) / 100,
    percentage: Math.round(percentage * 100) / 100,
    perQuestion,
  };
}

module.exports = { gradeQuestion, gradeAttempt, outcomeFromJudge };
