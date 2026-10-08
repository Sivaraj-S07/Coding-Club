const { gradeQuestion } = require("./scoring");

/**
 * Builds the post-submission answer review: for every question the student did
 * NOT get right, report the question number, the question text, what the
 * student submitted and what the correct answer is.
 *
 * `questions` must be ordered exactly as they are numbered for the student
 * (order_index ascending) and include quiz_options / answer-key fields.
 */
function textForOption(question, optionId) {
  if (!optionId) return null;
  const option = (question.quiz_options || []).find((o) => o.id === optionId);
  return option ? option.option_text : null;
}

function correctAnswerText(question) {
  const type = question.question_type || "mcq";
  if (type === "fill_blank") {
    const answers = Array.isArray(question.blank_answers) ? question.blank_answers : [];
    return answers
      .map((a) => (Array.isArray(a) ? a[0] : a))
      .filter((a) => a !== null && a !== undefined && String(a).trim() !== "")
      .join(", ");
  }
  if (type === "coding") {
    return question.expected_output ? String(question.expected_output) : "";
  }
  const correct = (question.quiz_options || []).find((o) => o.is_correct);
  return correct ? correct.option_text : "";
}

function submittedAnswerText(question, answer) {
  const type = question.question_type || "mcq";
  if (!answer) return "";
  if (type === "fill_blank") {
    const blanks = Array.isArray(answer.blanks) ? answer.blanks : [];
    return blanks.filter((b) => String(b || "").trim() !== "").join(", ");
  }
  if (type === "coding") {
    return answer.code ? String(answer.code) : "";
  }
  return textForOption(question, answer.optionId) || "";
}

// Failed hidden test cases from a stored judge verdict, already redacted by
// the judge itself (backend/src/utils/codeRunner.js): a hidden case the
// student passed carries no input/expectedOutput here, only a hidden case
// they failed does. Correct hidden cases are never included.
function failedHiddenCases(answer) {
  const cases = answer && answer.judge && Array.isArray(answer.judge.cases) ? answer.judge.cases : [];
  return cases
    .filter((c) => c.hidden && !c.passed && c.input != null)
    .map((c) => ({ name: c.name, input: c.input, expectedOutput: c.expectedOutput }));
}

function buildAnswerReview(questions, answersByQuestionId) {
  const review = [];
  (questions || []).forEach((q, index) => {
    const answer = answersByQuestionId.has(q.id) ? answersByQuestionId.get(q.id) : null;
    const { outcome, marksAwarded } = gradeQuestion(q, answer);
    if (outcome === "correct") return;

    const yourAnswer = submittedAnswerText(q, answer);
    review.push({
      questionId: q.id,
      questionNumber: index + 1,
      type: q.question_type || "mcq",
      question: q.question_text,
      yourAnswer: yourAnswer || null,
      correctAnswer: correctAnswerText(q) || null,
      answered: outcome !== "unanswered",
      outcome,
      marksAwarded,
      // Judge summary for programming questions (how many hidden tests passed).
      testsPassed: answer && answer.judge ? Number(answer.judge.passed || 0) : null,
      testsTotal: answer && answer.judge ? Number(answer.judge.total || 0) : null,
      judgeStatus: answer && answer.judge ? answer.judge.status || null : null,
      // Only ever the hidden cases this attempt FAILED — passed hidden
      // cases stay hidden, exactly as required.
      hiddenCaseDetails: q.question_type === "coding" ? failedHiddenCases(answer) : [],
    });
  });
  return review;
}

// Full per-question breakdown for EVERY question (correct ones included),
// with the student's exact submitted answer/code preserved as-is. Used by
// the Dashboard's "view my saved/submitted data and code" feature, where a
// student should be able to see everything they submitted — not just what
// they got wrong.
function buildFullAnswerReview(questions, answersByQuestionId) {
  return (questions || []).map((q, index) => {
    const answer = answersByQuestionId.has(q.id) ? answersByQuestionId.get(q.id) : null;
    const { outcome, marksAwarded } = gradeQuestion(q, answer);
    const type = q.question_type || "mcq";
    return {
      questionId: q.id,
      questionNumber: index + 1,
      type,
      question: q.question_text,
      yourAnswer: submittedAnswerText(q, answer) || null,
      // The raw code the student submitted, kept verbatim (not the display
      // text used above) so it can be shown in a code editor / viewer.
      yourCode: type === "coding" && answer ? answer.code || null : null,
      language: answer && answer.judge ? answer.judge.language || null : null,
      correctAnswer: correctAnswerText(q) || null,
      answered: outcome !== "unanswered",
      outcome,
      marksAwarded,
      maxMarks: q.marks,
      testsPassed: answer && answer.judge ? Number(answer.judge.passed || 0) : null,
      testsTotal: answer && answer.judge ? Number(answer.judge.total || 0) : null,
      judgeStatus: answer && answer.judge ? answer.judge.status || null : null,
      hiddenCaseDetails: type === "coding" ? failedHiddenCases(answer) : [],
    };
  });
}

module.exports = { buildAnswerReview, buildFullAnswerReview };
