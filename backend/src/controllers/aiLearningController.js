/**
 * Student-facing AI learning API: learning profile, curriculum, adaptive
 * practice sessions and personalised recommendations.
 *
 * Security notes
 *  - Every handler runs behind requireStudentAccount and scopes all queries by
 *    req.student.studentId from the verified JWT (never a client-sent id).
 *  - The correct answer and explanation are only returned AFTER an answer is
 *    submitted; the question the browser sees has neither.
 *  - A session only accepts an answer for the question it is currently asking
 *    (current_state.questionId) and each answer is claimed with an optimistic
 *    concurrency check, so replays / double clicks cannot inflate the score.
 */
const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { TOPICS, QUESTIONS, LEVELS } = require("../data/curriculum");
const engine = require("../utils/adaptiveEngine");
const { buildRecommendations, nextStreak } = require("../utils/recommendations");
const { loadQuizSignals } = require("../utils/quizSignals");
const store = require("../utils/learningStore");
const aiProvider = require("../utils/aiProvider");

const DEFAULT_QUESTIONS = 8;

function publicSession(row) {
  return {
    id: row.id,
    topicId: row.topic_id || null,
    language: row.language,
    status: row.status,
    total: row.total_questions,
    answered: row.answered_count,
    correct: row.correct_count,
    level: row.current_level,
    levelPath: Array.isArray(row.level_path) ? row.level_path : [],
    xpEarned: row.xp_earned || 0,
    startedAt: row.started_at,
    completedAt: row.completed_at || null,
  };
}

const questionById = (id) => QUESTIONS.find((q) => q.id === id) || null;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
const getProfile = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const row = await store.ensureProfileRow(supabase, req.student.studentId);
  res.json({ success: true, profile: store.toProfilePayload(row), ai: aiProvider.status() });
});

const updateProfile = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const body = req.body || {};
  const current = await store.ensureProfileRow(supabase, req.student.studentId);
  const patch = {};

  if (body.language !== undefined) {
    if (!store.LANGS.includes(body.language)) throw new ApiError(400, "language must be 'en' or 'ta'");
    patch.preferred_language = body.language;
  }
  if (body.style !== undefined) {
    if (!store.STYLES.includes(body.style)) throw new ApiError(400, "Unknown explanation style");
    patch.explanation_style = body.style;
  }
  if (body.goal !== undefined) {
    patch.goal = String(body.goal || "").trim().slice(0, 200);
  }
  if (body.accessibility !== undefined) {
    patch.accessibility = store.sanitizeAccessibility(body.accessibility, store.sanitizeAccessibility(current.accessibility));
  }
  if (!Object.keys(patch).length) throw new ApiError(400, "Nothing to update");

  const row = await store.updateProfileRow(supabase, req.student.studentId, patch);
  res.json({ success: true, profile: store.toProfilePayload(row) });
});

// ---------------------------------------------------------------------------
// Curriculum (lessons only — the question bank / answers never leave the server)
// ---------------------------------------------------------------------------
const getCurriculum = asyncHandler(async (req, res) => {
  const topics = TOPICS.map((t) => {
    const counts = {};
    for (const lvl of LEVELS) counts[lvl] = QUESTIONS.filter((q) => q.topic === t.id && q.level === lvl).length;
    return {
      id: t.id,
      order: t.order,
      icon: t.icon,
      prerequisites: t.prerequisites,
      title: t.title,
      summary: t.summary,
      simple: t.simple,
      steps: t.steps,
      example: t.example,
      mistakes: t.mistakes,
      questionCounts: counts,
    };
  });
  res.json({ success: true, topics, levels: LEVELS });
});

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------
async function awardProgress(supabase, studentId, { xp, practiceAnswers }) {
  const row = await store.ensureProfileRow(supabase, studentId);
  const streak = nextStreak({ lastActiveDate: row.last_active_date, streakDays: row.streak_days });
  return store.updateProfileRow(supabase, studentId, {
    xp: (Number(row.xp) || 0) + xp,
    total_practice_answers: (Number(row.total_practice_answers) || 0) + practiceAnswers,
    streak_days: streak.streakDays,
    last_active_date: streak.lastActiveDate,
  });
}

// ---------------------------------------------------------------------------
// Adaptive practice
// ---------------------------------------------------------------------------
const startAdaptive = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const studentId = req.student.studentId;
  const body = req.body || {};

  const topicId = body.topicId ? String(body.topicId) : null;
  if (topicId && !TOPICS.some((t) => t.id === topicId)) throw new ApiError(400, "Unknown topic");

  const poolSize = QUESTIONS.filter((q) => !topicId || q.topic === topicId).length;
  const requested = Number.parseInt(body.count, 10);
  const total = Math.min(poolSize, engine.clamp(Number.isFinite(requested) ? requested : DEFAULT_QUESTIONS, 3, 12));

  const profile = await store.ensureProfileRow(supabase, studentId);
  const language = store.LANGS.includes(body.language) ? body.language : profile.preferred_language;

  const masteryRows = await store.listMastery(supabase, studentId);
  const masteryByTopic = Object.fromEntries(masteryRows.map((r) => [r.topic_id, Number(r.mastery)]));
  const recentIds = await store.recentAnsweredQuestionIds(supabase, studentId);

  // Starting level: the topic's mastery, or the average of started topics for a mixed session.
  let startMastery = engine.INITIAL_MASTERY;
  if (topicId) startMastery = masteryByTopic[topicId] ?? engine.INITIAL_MASTERY;
  else if (masteryRows.length) startMastery = masteryRows.reduce((s, r) => s + Number(r.mastery), 0) / masteryRows.length;
  const level = engine.startingLevel(startMastery);

  const firstTopic = topicId || engine.pickTopicForMixed({ masteryByTopic });
  const question = engine.pickQuestion({ topicId: firstTopic, level, recentIds });
  if (!question) throw new ApiError(404, "No practice questions are available for that topic yet");
  const served = engine.serveQuestion(question);

  // A student only ever has one live practice session; older unfinished ones are closed.
  await supabase.from("adaptive_sessions").update({ status: "abandoned" }).eq("student_id", studentId).eq("status", "in_progress");

  const inserted = await supabase
    .from("adaptive_sessions")
    .insert({
      student_id: studentId,
      topic_id: topicId,
      language,
      total_questions: total,
      current_level: level,
      level_path: [level],
      served_ids: [question.id],
      current_state: { ...served, servedAt: new Date().toISOString() },
    })
    .select("*")
    .single();
  const session = store.unwrap(inserted, "start the practice session");

  res.status(201).json({
    success: true,
    session: publicSession(session),
    question: engine.publicQuestion(question, served.order, language),
  });
});

async function loadOwnSession(supabase, studentId, sessionId) {
  const result = await supabase.from("adaptive_sessions").select("*").eq("id", sessionId).eq("student_id", studentId).maybeSingle();
  const row = store.unwrap(result, "load the practice session");
  if (!row) throw new ApiError(404, "Practice session not found");
  return row;
}

async function buildSummary(supabase, session, xpTotal) {
  const result = await supabase.from("adaptive_answers").select("topic_id, difficulty, is_correct").eq("session_id", session.id);
  const answers = store.unwrap(result, "load session answers") || [];
  const summary = engine.summarizeSession({ answers, levelPath: session.level_path || [] });
  const byTopic = {};
  for (const a of answers) {
    byTopic[a.topic_id] = byTopic[a.topic_id] || { answered: 0, correct: 0 };
    byTopic[a.topic_id].answered += 1;
    if (a.is_correct) byTopic[a.topic_id].correct += 1;
  }
  const focusTopics = Object.entries(byTopic)
    .filter(([, v]) => v.answered >= 1 && v.correct / v.answered < 0.5)
    .map(([topicId]) => topicId);
  // Fewer answers than planned means the questions at the student's level ran
  // out (they were struggling) — the UI then points them to the lesson.
  return { ...summary, xpEarned: xpTotal, byTopic, focusTopics, endedEarly: session.answered_count < session.total_questions };
}

const answerAdaptive = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const studentId = req.student.studentId;
  const session = await loadOwnSession(supabase, studentId, req.params.sessionId);
  if (session.status !== "in_progress") throw new ApiError(409, "This practice session has already finished");

  const state = session.current_state;
  const { questionId, selectedIndex, timeMs } = req.body || {};
  if (!state || state.questionId !== questionId) {
    throw new ApiError(409, "That question is no longer active. Reload the practice session to continue.");
  }
  const question = questionById(state.questionId);
  if (!question) throw new ApiError(410, "That question has been retired");

  const graded = engine.gradeAnswer(question, state.order, selectedIndex, session.language);
  if (!graded.valid) throw new ApiError(400, "Choose one of the listed options");

  const serverMs = Math.max(0, Date.now() - Date.parse(state.servedAt || new Date().toISOString()));
  const clientMs = Number(timeMs);
  const elapsed = Math.round(Math.min(Number.isFinite(clientMs) && clientMs >= 0 ? clientMs : serverMs, serverMs + 2000, 10 * 60 * 1000));

  const transition = engine.applyAnswerToState(
    { level: session.current_level, correctStreak: session.correct_streak, wrongStreak: session.wrong_streak },
    graded.correct
  );

  const answered = session.answered_count + 1;
  const correctCount = session.correct_count + (graded.correct ? 1 : 0);
  const xpGained = engine.xpForAnswer(question.level, graded.correct);

  // Pick what comes next (unless this was the last question or the topic ran dry).
  let finished = answered >= session.total_questions;
  let nextQuestion = null;
  let nextServed = null;
  if (!finished) {
    const recentIds = await store.recentAnsweredQuestionIds(supabase, studentId);
    let topicForNext = session.topic_id;
    if (!topicForNext) {
      const masteryRows = await store.listMastery(supabase, studentId);
      topicForNext = engine.pickTopicForMixed({
        masteryByTopic: Object.fromEntries(masteryRows.map((r) => [r.topic_id, Number(r.mastery)])),
        lastTopicId: question.topic,
        seenInSession: session.served_ids || [],
      });
    }
    nextQuestion = topicForNext
      ? engine.pickQuestion({ topicId: topicForNext, level: transition.to, seenInSession: session.served_ids || [], recentIds, allowHarder: graded.correct })
      : null;
    if (nextQuestion) nextServed = engine.serveQuestion(nextQuestion);
    else finished = true;
  }

  const patch = {
    answered_count: answered,
    correct_count: correctCount,
    current_level: transition.to,
    correct_streak: transition.correctStreak,
    wrong_streak: transition.wrongStreak,
    level_path: [...(session.level_path || []), ...(nextQuestion ? [nextQuestion.level] : [])],
    served_ids: nextQuestion ? [...(session.served_ids || []), nextQuestion.id] : session.served_ids || [],
    current_state: finished ? null : { ...nextServed, servedAt: new Date().toISOString() },
    xp_earned: (session.xp_earned || 0) + xpGained,
    ...(finished ? { status: "completed", completed_at: new Date().toISOString() } : {}),
  };

  // Claim the answer: only succeeds if no other request advanced this session
  // since we read it (double-click / replay protection).
  const claimed = await supabase
    .from("adaptive_sessions")
    .update(patch)
    .eq("id", session.id)
    .eq("student_id", studentId)
    .eq("answered_count", session.answered_count)
    .select("*");
  const claimedRows = store.unwrap(claimed, "save your answer");
  if (!claimedRows || !claimedRows.length) throw new ApiError(409, "That answer was already submitted");
  let updated = claimedRows[0];

  // Secondary writes are best-effort: the student's answer is already recorded
  // in the session, and a hiccup here must not turn into a failed answer.
  const before = (await store.listMastery(supabase, studentId).catch(() => [])).find((r) => r.topic_id === question.topic);
  const masteryBefore = before ? Number(before.mastery) : engine.INITIAL_MASTERY;
  const masteryAfter = engine.updateMastery(masteryBefore, question.level, graded.correct);
  await Promise.all([
    supabase
      .from("adaptive_answers")
      .insert({
        session_id: session.id,
        student_id: studentId,
        topic_id: question.topic,
        question_id: question.id,
        difficulty: question.level,
        selected_index: Number(selectedIndex),
        is_correct: graded.correct,
        time_ms: elapsed,
      })
      .then((r) => r.error && console.warn("[ai-learning] answer log failed:", r.error.message)),
    store
      .upsertMastery(supabase, {
        student_id: studentId,
        topic_id: question.topic,
        mastery: masteryAfter,
        attempts: (before ? Number(before.attempts) : 0) + 1,
        correct: (before ? Number(before.correct) : 0) + (graded.correct ? 1 : 0),
        current_level: engine.startingLevel(masteryAfter),
        last_practiced_at: new Date().toISOString(),
      })
      .catch((e) => console.warn("[ai-learning] mastery update failed:", e.message)),
  ]);

  let summary = null;
  let totalXp = xpGained;
  if (finished) {
    const accuracy = answered ? correctCount / answered : 0;
    const bonus = engine.sessionBonusXp(accuracy);
    totalXp = (updated.xp_earned || 0) + bonus;
    const bumped = await supabase.from("adaptive_sessions").update({ xp_earned: totalXp }).eq("id", session.id).select("*");
    if (!bumped.error && bumped.data && bumped.data[0]) updated = bumped.data[0];
    summary = await buildSummary(supabase, updated, totalXp).catch(() => null);
    await awardProgress(supabase, studentId, { xp: xpGained + bonus, practiceAnswers: 1 }).catch((e) =>
      console.warn("[ai-learning] progress update failed:", e.message)
    );
  } else {
    await awardProgress(supabase, studentId, { xp: xpGained, practiceAnswers: 1 }).catch((e) =>
      console.warn("[ai-learning] progress update failed:", e.message)
    );
  }

  res.json({
    success: true,
    result: {
      correct: graded.correct,
      correctIndex: graded.correctIndex,
      correctText: graded.correctText,
      explanation: graded.explanation,
      xpGained,
    },
    levelChange: { from: transition.from, to: transition.to, direction: transition.direction },
    mastery: { topicId: question.topic, before: masteryBefore, after: masteryAfter, label: engine.masteryLabel(masteryAfter) },
    session: publicSession(updated),
    nextQuestion: nextQuestion ? engine.publicQuestion(nextQuestion, nextServed.order, session.language) : null,
    summary,
  });
});

const getAdaptiveSession = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const session = await loadOwnSession(supabase, req.student.studentId, req.params.sessionId);
  let question = null;
  let summary = null;
  if (session.status === "in_progress" && session.current_state) {
    const q = questionById(session.current_state.questionId);
    if (q) question = engine.publicQuestion(q, session.current_state.order, session.language);
  } else if (session.status === "completed") {
    summary = await buildSummary(supabase, session, session.xp_earned || 0).catch(() => null);
  }
  res.json({ success: true, session: publicSession(session), question, summary });
});

const listAdaptiveSessions = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const result = await supabase
    .from("adaptive_sessions")
    .select("*")
    .eq("student_id", req.student.studentId)
    .order("started_at", { ascending: false })
    .limit(10);
  const rows = store.unwrap(result, "load practice history") || [];
  res.json({ success: true, sessions: rows.map(publicSession) });
});

// ---------------------------------------------------------------------------
// Recommendations + study plan
// ---------------------------------------------------------------------------
async function buildStudentRecommendations(supabase, studentId) {
  const [masteryRows, signals, tutorCounts] = await Promise.all([
    store.listMastery(supabase, studentId),
    loadQuizSignals(supabase, { studentIds: [studentId] }),
    store.tutorTopicCounts(supabase, studentId).catch(() => ({})),
  ]);
  return buildRecommendations({ masteryRows, quizSignals: signals.get(studentId) || {}, tutorCounts });
}

const getRecommendations = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const studentId = req.student.studentId;
  const profileRow = await store.ensureProfileRow(supabase, studentId);
  const recommendations = await buildStudentRecommendations(supabase, studentId);
  res.json({
    success: true,
    recommendations,
    profile: store.toProfilePayload(profileRow),
    generatedAt: new Date().toISOString(),
  });
});

module.exports = {
  getProfile,
  updateProfile,
  getCurriculum,
  startAdaptive,
  answerAdaptive,
  getAdaptiveSession,
  listAdaptiveSessions,
  getRecommendations,
  buildStudentRecommendations,
  publicSession,
};
