const { TOPICS } = require("../data/curriculum");

// Short, very common words only count a little — they appear in ordinary
// English sentences, not only in code questions.
const WEAK_KEYWORDS = new Set(["else", "while", "range", "len", "list", "repeat", "element", "int", "str", "character", "condition", "decision"]);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MATCHERS = TOPICS.map((topic) => ({
  id: topic.id,
  rules: topic.keywords.map((kw) => {
    const startsWord = /^[A-Za-z0-9_]/.test(kw);
    const endsWord = /[A-Za-z0-9_]$/.test(kw);
    const re = new RegExp(`${startsWord ? "\\b" : ""}${escapeRegex(kw)}${endsWord ? "\\b" : ""}`, "gi");
    return { re, weight: WEAK_KEYWORDS.has(kw.toLowerCase()) ? 0.4 : 1 };
  }),
}));

/**
 * Heuristic: which curriculum topic is this text about? Returns null when
 * nothing matches well enough. Used to (a) route tutor questions to the right
 * lesson and (b) attribute admin-authored quiz questions to a topic so quiz
 * results can feed weak-topic detection. It is intentionally simple and
 * explainable — it is a hint, never a grade.
 */
function classifyTopic(text) {
  const source = String(text || "");
  if (!source.trim()) return null;
  let best = null;
  for (const m of MATCHERS) {
    let score = 0;
    for (const rule of m.rules) {
      const hits = source.match(rule.re);
      if (hits) score += Math.min(hits.length, 3) * rule.weight;
    }
    if (score > 0 && (!best || score > best.score)) best = { id: m.id, score };
  }
  return best && best.score >= 0.9 ? best.id : null;
}

module.exports = { classifyTopic };
