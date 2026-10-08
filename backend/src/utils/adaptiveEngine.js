/**
 * Adaptive practice engine (pure functions — no database, no network).
 *
 * How difficulty adapts
 * ---------------------
 *  - Every topic has a mastery estimate in [0, 1] (stored per student).
 *  - A session starts at a level derived from that mastery:
 *        < 0.40 -> easy,  < 0.70 -> medium,  otherwise hard.
 *  - After each answer: 2 correct in a row moves the level UP one step,
 *    2 wrong in a row moves it DOWN one step, and a single miss only resets
 *    the correct-streak. So the quiz climbs easy -> medium -> hard while the
 *    student succeeds, and eases off when they struggle.
 *  - Mastery is updated Elo-style: beating a hard question moves it more than
 *    beating an easy one, and missing an easy question costs more.
 */
const { LEVELS, QUESTIONS, TOPICS } = require("../data/curriculum");

const LEVEL_WEIGHT = { easy: 0.3, medium: 0.55, hard: 0.8 };
const LEVEL_XP = { easy: 10, medium: 15, hard: 25 };
const STREAK_TO_LEVEL_UP = 2;
const STREAK_TO_LEVEL_DOWN = 2;
const MASTERY_K = 0.12;
const INITIAL_MASTERY = 0.3;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

function isLevel(level) {
  return LEVELS.includes(level);
}

function startingLevel(mastery) {
  const m = Number.isFinite(Number(mastery)) ? Number(mastery) : INITIAL_MASTERY;
  if (m < 0.4) return "easy";
  if (m < 0.7) return "medium";
  return "hard";
}

/** Returns the level after an answer plus the direction of any change. */
function nextLevel({ level, correctStreak, wrongStreak }) {
  const idx = Math.max(0, LEVELS.indexOf(level));
  if (correctStreak >= STREAK_TO_LEVEL_UP && idx < LEVELS.length - 1) {
    return { level: LEVELS[idx + 1], direction: "up", correctStreak: 0, wrongStreak: 0 };
  }
  if (wrongStreak >= STREAK_TO_LEVEL_DOWN && idx > 0) {
    return { level: LEVELS[idx - 1], direction: "down", correctStreak: 0, wrongStreak: 0 };
  }
  return { level: LEVELS[idx], direction: "same", correctStreak, wrongStreak };
}

/** Streak bookkeeping + level decision for one answered question. */
function applyAnswerToState(state, correct) {
  const correctStreak = correct ? (state.correctStreak || 0) + 1 : 0;
  const wrongStreak = correct ? 0 : (state.wrongStreak || 0) + 1;
  const decision = nextLevel({ level: state.level, correctStreak, wrongStreak });
  return {
    from: state.level,
    to: decision.level,
    direction: decision.direction,
    correctStreak: decision.correctStreak,
    wrongStreak: decision.wrongStreak,
  };
}

function updateMastery(mastery, level, correct) {
  const m = Number.isFinite(Number(mastery)) ? Number(mastery) : INITIAL_MASTERY;
  const expected = 1 / (1 + Math.exp(-6 * (m - (LEVEL_WEIGHT[level] ?? 0.55))));
  return round(clamp(m + MASTERY_K * ((correct ? 1 : 0) - expected), 0, 1));
}

function masteryLabel(mastery) {
  if (mastery >= 0.7) return "strong";
  if (mastery >= 0.4) return "growing";
  return "needs-work";
}

/** Deterministic-friendly shuffle (inject `rng` in tests). */
function shuffle(items, rng = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function bankFor(topicId, bank = QUESTIONS) {
  return topicId ? bank.filter((q) => q.topic === topicId) : bank;
}

/**
 * Chooses the next question.
 *  1. unseen question at the wanted level, preferring ones not answered
 *     recently in earlier sessions;
 *  2. otherwise the closest other level — EASIER levels first on a tie;
 *  3. when `allowHarder` is false (the student just got one wrong) a harder
 *     level is never used as a fallback: a struggling student must not be
 *     escalated just because the bank ran out of easy questions. In that case
 *     null is returned and the session ends with a "review the lesson" summary;
 *  4. null when the topic is exhausted.
 */
function pickQuestion({ topicId = null, level, seenInSession = [], recentIds = [], bank = QUESTIONS, rng = Math.random, allowHarder = true }) {
  const seen = new Set(seenInSession);
  const recent = new Set(recentIds);
  const pool = bankFor(topicId, bank).filter((q) => !seen.has(q.id));
  if (!pool.length) return null;

  const want = LEVELS.indexOf(level);
  const order = LEVELS.map((l, i) => ({ l, i }))
    .filter(({ i }) => allowHarder || i <= want)
    .sort((a, b) => Math.abs(a.i - want) - Math.abs(b.i - want) || a.i - b.i)
    .map(({ l }) => l);
  for (const lvl of order) {
    const atLevel = pool.filter((q) => q.level === lvl);
    if (!atLevel.length) continue;
    const fresh = atLevel.filter((q) => !recent.has(q.id));
    return shuffle(fresh.length ? fresh : atLevel, rng)[0];
  }
  return null;
}

/** For mixed-topic sessions: weakest topic first, never the same topic twice in a row. */
function pickTopicForMixed({ masteryByTopic = {}, lastTopicId = null, seenInSession = [], bank = QUESTIONS }) {
  const seen = new Set(seenInSession);
  const candidates = TOPICS.filter((t) => bankFor(t.id, bank).some((q) => !seen.has(q.id)));
  if (!candidates.length) return null;
  const ranked = [...candidates].sort(
    (a, b) => (masteryByTopic[a.id] ?? INITIAL_MASTERY) - (masteryByTopic[b.id] ?? INITIAL_MASTERY)
  );
  const choice = ranked.find((t) => t.id !== lastTopicId) || ranked[0];
  return choice.id;
}

/** Shuffles the options and remembers the mapping so the answer key stays server-side. */
function serveQuestion(question, rng = Math.random) {
  const order = shuffle(question.options.map((_, i) => i), rng);
  return { questionId: question.id, order, level: question.level, topicId: question.topic };
}

function pick(obj, lang) {
  if (!obj) return "";
  return obj[lang] || obj.en || "";
}

/** The question as the browser sees it: NO correct answer, NO explanation. */
function publicQuestion(question, order, lang = "en") {
  const useTa = lang === "ta" && Array.isArray(question.optionsTa) && question.optionsTa.length === question.options.length;
  const source = useTa ? question.optionsTa : question.options;
  return {
    id: question.id,
    topicId: question.topic,
    level: question.level,
    text: pick(question.q, lang),
    options: order.map((originalIndex) => source[originalIndex]),
  };
}

/** `selectedIndex` is the index in the shuffled list the student saw. */
function gradeAnswer(question, order, selectedIndex, lang = "en") {
  // Number(null) === 0 and Number("") === 0, so only real numbers / digit
  // strings count — a missing selection must never be graded as option 0.
  const isNumeric =
    (typeof selectedIndex === "number" && Number.isFinite(selectedIndex)) ||
    (typeof selectedIndex === "string" && /^\d+$/.test(selectedIndex));
  const idx = isNumeric ? Number(selectedIndex) : NaN;
  const valid = Number.isInteger(idx) && idx >= 0 && idx < order.length;
  const correctIndex = order.indexOf(0); // options[0] is correct in the bank
  const useTa = lang === "ta" && Array.isArray(question.optionsTa) && question.optionsTa.length === question.options.length;
  const source = useTa ? question.optionsTa : question.options;
  return {
    valid,
    correct: valid && order[idx] === 0,
    correctIndex,
    correctText: source[0],
    explanation: pick(question.explain, lang),
  };
}

function xpForAnswer(level, correct) {
  return correct ? LEVEL_XP[level] || 10 : 2; // a small reward for trying
}

function sessionBonusXp(accuracy) {
  return accuracy >= 0.7 ? 20 : 5;
}

function summarizeSession({ answers = [], levelPath = [] }) {
  const total = answers.length;
  const correct = answers.filter((a) => a.is_correct ?? a.correct).length;
  const byLevel = {};
  for (const lvl of LEVELS) byLevel[lvl] = { answered: 0, correct: 0 };
  for (const a of answers) {
    const lvl = a.difficulty || a.level;
    if (!byLevel[lvl]) continue;
    byLevel[lvl].answered += 1;
    if (a.is_correct ?? a.correct) byLevel[lvl].correct += 1;
  }
  const accuracy = total ? round(correct / total) : 0;
  return {
    total,
    correct,
    accuracy,
    byLevel,
    startLevel: levelPath[0] || null,
    endLevel: levelPath[levelPath.length - 1] || null,
    peakLevel: levelPath.reduce((best, l) => (LEVELS.indexOf(l) > LEVELS.indexOf(best) ? l : best), levelPath[0] || "easy"),
  };
}

module.exports = {
  LEVELS,
  LEVEL_WEIGHT,
  INITIAL_MASTERY,
  isLevel,
  startingLevel,
  nextLevel,
  applyAnswerToState,
  updateMastery,
  masteryLabel,
  shuffle,
  pickQuestion,
  pickTopicForMixed,
  serveQuestion,
  publicQuestion,
  gradeAnswer,
  xpForAnswer,
  sessionBonusXp,
  summarizeSession,
  clamp,
  round,
};
