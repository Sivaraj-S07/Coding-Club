/**
 * Turns students' submitted quiz answers into per-topic accuracy so the
 * recommendation engine can use real quiz performance, not just adaptive
 * practice. Admin-authored questions carry no topic tag, so the topic is
 * inferred from the question text (see topicClassifier — a heuristic hint).
 *
 * Returns Map<studentId, { [topicId]: { attempted, correct } }>.
 */
const { classifyTopic } = require("./topicClassifier");

const CHUNK = 150;
const MAX_ATTEMPTS = 6000;

function chunked(items, size = CHUNK) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function selectAnswers(supabase, attemptIds) {
  const wide = await supabase
    .from("answers")
    .select("attempt_id, question_id, selected_option_id, marks_awarded")
    .in("attempt_id", attemptIds);
  if (!wide.error) return wide.data || [];
  // Older databases without answers.marks_awarded still work for MCQs.
  const narrow = await supabase.from("answers").select("attempt_id, question_id, selected_option_id").in("attempt_id", attemptIds);
  return narrow.error ? [] : narrow.data || [];
}

async function loadQuizSignals(supabase, { studentIds = null } = {}) {
  const result = new Map();
  try {
    let attemptQuery = supabase
      .from("quiz_attempts")
      .select("id, student_id")
      .in("status", ["submitted", "auto_submitted"]);
    if (Array.isArray(studentIds) && studentIds.length === 1) attemptQuery = attemptQuery.eq("student_id", studentIds[0]);
    else if (Array.isArray(studentIds)) attemptQuery = attemptQuery.in("student_id", studentIds);
    const { data: attempts, error } = await attemptQuery.order("submitted_at", { ascending: false }).limit(MAX_ATTEMPTS);
    if (error || !attempts || !attempts.length) return result;

    const studentByAttempt = new Map(attempts.map((a) => [a.id, a.student_id]));
    const answers = [];
    for (const ids of chunked(attempts.map((a) => a.id))) answers.push(...(await selectAnswers(supabase, ids)));
    if (!answers.length) return result;

    const questions = new Map();
    for (const ids of chunked([...new Set(answers.map((a) => a.question_id))])) {
      const { data } = await supabase
        .from("questions")
        .select("id, question_text, question_type, marks, quiz_options(id, is_correct)")
        .in("id", ids);
      for (const q of data || []) questions.set(q.id, q);
    }

    const topicByQuestion = new Map();
    for (const q of questions.values()) topicByQuestion.set(q.id, classifyTopic(q.question_text));

    for (const a of answers) {
      const q = questions.get(a.question_id);
      const topic = topicByQuestion.get(a.question_id);
      const studentId = studentByAttempt.get(a.attempt_id);
      if (!q || !topic || !studentId) continue;

      let score = null; // fraction 0..1, or null when the answer carries no signal
      const type = q.question_type || "mcq";
      if (type === "mcq") {
        if (!a.selected_option_id) continue; // unanswered is not evidence of misunderstanding
        const option = (q.quiz_options || []).find((o) => o.id === a.selected_option_id);
        score = option && option.is_correct ? 1 : 0;
      } else if (a.marks_awarded !== null && a.marks_awarded !== undefined && Number(q.marks) > 0) {
        score = Math.max(0, Math.min(1, Number(a.marks_awarded) / Number(q.marks)));
      }
      if (score === null) continue;

      if (!result.has(studentId)) result.set(studentId, {});
      const bucket = result.get(studentId);
      if (!bucket[topic]) bucket[topic] = { attempted: 0, correct: 0 };
      bucket[topic].attempted += 1;
      bucket[topic].correct += score >= 0.999 ? 1 : 0;
    }
  } catch (err) {
    // Quiz signals are a bonus input; never let them break the learning APIs.
    console.warn("[ai-learning] quiz signals unavailable:", err.message);
  }
  return result;
}

module.exports = { loadQuizSignals };
