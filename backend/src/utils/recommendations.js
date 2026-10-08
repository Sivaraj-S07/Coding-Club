/**
 * Weak-topic detection, "what to learn next" and the study plan (pure functions).
 *
 * Inputs are plain objects so this works the same for one student (Learn hub /
 * Dashboard) and in bulk for the teacher dashboard.
 *
 *   masteryRows : [{ topic_id, mastery, attempts, correct, last_practiced_at }]
 *   quizSignals : { [topicId]: { attempted, correct } }   // from submitted quizzes
 *   tutorCounts : { [topicId]: number }                   // questions asked to the tutor
 */
const { TOPICS } = require("../data/curriculum");
const { INITIAL_MASTERY, masteryLabel, round } = require("./adaptiveEngine");

const MIN_ATTEMPTS_FOR_JUDGEMENT = 3;
const REVIEW_AFTER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function buildTopicStats({ masteryRows = [], quizSignals = {}, tutorCounts = {}, now = Date.now() }) {
  const byTopic = new Map(masteryRows.map((r) => [r.topic_id, r]));
  return TOPICS.map((topic) => {
    const row = byTopic.get(topic.id);
    const practiceAttempts = Number(row?.attempts) || 0;
    const practiceCorrect = Number(row?.correct) || 0;
    const quiz = quizSignals[topic.id] || { attempted: 0, correct: 0 };
    const attempts = practiceAttempts + quiz.attempted;
    const correct = practiceCorrect + quiz.correct;
    const accuracy = attempts ? correct / attempts : null;

    // Mastery is driven by adaptive practice. With no practice yet, fall back
    // to quiz accuracy (when there is enough of it) so a student who has only
    // taken quizzes still gets sensible recommendations.
    let mastery = row ? Number(row.mastery) : null;
    if (mastery === null || Number.isNaN(mastery)) {
      mastery = quiz.attempted >= MIN_ATTEMPTS_FOR_JUDGEMENT ? round(quiz.correct / quiz.attempted * 0.9) : INITIAL_MASTERY;
    }
    const lastPracticedAt = row?.last_practiced_at ? new Date(row.last_practiced_at).getTime() : null;
    const daysSince = lastPracticedAt ? Math.floor((now - lastPracticedAt) / DAY_MS) : null;
    const judged = attempts >= MIN_ATTEMPTS_FOR_JUDGEMENT;
    const weak = judged && (mastery < 0.45 || (accuracy !== null && accuracy < 0.5));
    const mastered = judged && mastery >= 0.7 && (accuracy === null || accuracy >= 0.7);

    return {
      topicId: topic.id,
      order: topic.order,
      mastery: round(mastery, 2),
      label: masteryLabel(mastery),
      attempts,
      correct,
      accuracy: accuracy === null ? null : round(accuracy, 2),
      practiceAttempts,
      quizAttempts: quiz.attempted,
      tutorQuestions: Number(tutorCounts[topic.id]) || 0,
      lastPracticedAt: row?.last_practiced_at || null,
      daysSincePractice: daysSince,
      started: attempts > 0,
      weak,
      mastered,
      needsReview: mastered || mastery >= 0.5 ? daysSince !== null && daysSince >= REVIEW_AFTER_DAYS : false,
    };
  });
}

function overallLevel(stats) {
  const started = stats.filter((s) => s.started);
  if (!started.length) return { key: "not-started", mastery: 0 };
  const avg = started.reduce((sum, s) => sum + s.mastery, 0) / started.length;
  const key = avg >= 0.7 ? "advanced" : avg >= 0.4 ? "intermediate" : "beginner";
  return { key, mastery: round(avg, 2) };
}

function buildRecommendations(input) {
  const stats = buildTopicStats(input);
  const weak = stats.filter((s) => s.weak).sort((a, b) => a.mastery - b.mastery);
  const strengths = stats.filter((s) => s.mastered).sort((a, b) => b.mastery - a.mastery);
  const review = stats.filter((s) => s.needsReview).sort((a, b) => (b.daysSincePractice || 0) - (a.daysSincePractice || 0));

  // "Learn next": the first topic in curriculum order that isn't mastered and
  // isn't already flagged weak (weak topics are shown separately). The
  // curriculum order respects prerequisites, so this is always a sensible step.
  const nextTopic = stats.find((s) => !s.mastered && !s.weak) || null;

  const actions = [];
  for (const w of weak.slice(0, 2)) {
    actions.push({ type: "practice", reason: "weak", topicId: w.topicId, priority: 1 });
    actions.push({ type: "lesson", reason: "weak", topicId: w.topicId, priority: 2 });
  }
  if (nextTopic) {
    actions.push({ type: nextTopic.started ? "practice" : "lesson", reason: "next", topicId: nextTopic.topicId, priority: 3 });
  }
  for (const r of review.slice(0, 1)) {
    actions.push({ type: "practice", reason: "review", topicId: r.topicId, priority: 4 });
  }
  if (!stats.some((s) => s.started)) {
    actions.unshift({ type: "practice", reason: "start", topicId: null, priority: 0 });
  }
  const topicWithTutorQuestions = [...stats].sort((a, b) => b.tutorQuestions - a.tutorQuestions)[0];
  if (topicWithTutorQuestions && topicWithTutorQuestions.tutorQuestions >= 3 && topicWithTutorQuestions.mastery < 0.7) {
    actions.push({ type: "practice", reason: "asked-often", topicId: topicWithTutorQuestions.topicId, priority: 5 });
  }

  return {
    overall: overallLevel(stats),
    topics: stats,
    weakTopics: weak,
    strengths,
    review,
    next: nextTopic,
    actions: dedupeActions(actions).sort((a, b) => a.priority - b.priority).slice(0, 6),
    plan: buildStudyPlan({ stats, weak, review, nextTopic }),
  };
}

function dedupeActions(actions) {
  const seen = new Set();
  return actions.filter((a) => {
    const key = `${a.type}:${a.topicId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A simple 5-day plan: fix weak spots first, then move forward, then review. */
function buildStudyPlan({ stats, weak, review, nextTopic }) {
  const plan = [];
  const add = (day, type, topicId, minutes) => plan.push({ day, type, topicId, minutes });
  const first = weak[0] || nextTopic || stats[0];
  const second = weak[1] || nextTopic || stats[1] || stats[0];
  if (!first) return plan;

  add(1, "lesson", first.topicId, 10);
  add(1, "practice", first.topicId, 10);
  add(2, "practice", second.topicId, 15);
  add(3, "practice", (review[0] || first).topicId, 10);
  add(3, "tutor", first.topicId, 10);
  add(4, "lesson", (nextTopic || second).topicId, 10);
  add(4, "practice", (nextTopic || second).topicId, 10);
  add(5, "practice", null, 15); // mixed review
  add(5, "playground", (nextTopic || first).topicId, 15);
  return plan;
}

/** Streak helper: consecutive-day tracking from the last active date (UTC dates). */
function nextStreak({ lastActiveDate, streakDays }, today = new Date()) {
  const todayKey = today.toISOString().slice(0, 10);
  if (lastActiveDate === todayKey) return { streakDays: Math.max(1, streakDays || 1), lastActiveDate: todayKey };
  const yesterday = new Date(today.getTime() - DAY_MS).toISOString().slice(0, 10);
  const continued = lastActiveDate === yesterday;
  return { streakDays: continued ? (streakDays || 0) + 1 : 1, lastActiveDate: todayKey };
}

module.exports = { buildTopicStats, buildRecommendations, buildStudyPlan, overallLevel, nextStreak, MIN_ATTEMPTS_FOR_JUDGEMENT };
