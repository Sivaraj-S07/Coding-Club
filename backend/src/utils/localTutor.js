/**
 * Offline tutor + content simplifier. Used (a) when no AI key is configured
 * and (b) whenever the AI provider is down or times out, so the platform's
 * learning features always work. It is rule-based and built on the curriculum
 * lessons and glossary — less flexible than an LLM, but accurate and instant.
 */
const { TOPICS, GLOSSARY, PLAIN_WORDS } = require("../data/curriculum");
const { classifyTopic } = require("./topicClassifier");

const topicById = (id) => TOPICS.find((t) => t.id === id) || null;
const pick = (obj, lang) => (obj ? obj[lang] ?? obj.en : "");
const pickList = (obj, lang) => (obj ? obj[lang] ?? obj.en ?? [] : []);

const T = {
  en: {
    unknown: "I couldn't match that to one of my built-in lessons. Try asking about one of these topics:",
    needAi: "Tip: for open-ended questions, ask your teacher to enable the AI provider key on the server.",
    steps: "Steps",
    example: "Example",
    mistakes: "Common mistakes",
    next: "Want to test yourself? Try Adaptive Practice on this topic.",
    hello: "Hi! I'm your Eduverse tutor. Ask me about variables, conditions, loops, strings, lists or functions.",
    thanks: "You're welcome! Keep practising — small steps add up.",
    meaning: "means",
  },
  ta: {
    unknown: "இதை என் உள்ளமைந்த பாடங்களுடன் பொருத்த முடியவில்லை. இந்தத் தலைப்புகளில் ஒன்றைப் பற்றிக் கேளுங்கள்:",
    needAi: "குறிப்பு: திறந்த கேள்விகளுக்கு, சர்வரில் AI விசையை இயக்கும்படி உங்கள் ஆசிரியரிடம் கேளுங்கள்.",
    steps: "படிகள்",
    example: "எடுத்துக்காட்டு",
    mistakes: "பொதுவான தவறுகள்",
    next: "உங்களைச் சோதிக்க வேண்டுமா? இந்தத் தலைப்பில் Adaptive Practice முயலுங்கள்.",
    hello: "வணக்கம்! நான் உங்கள் Eduverse பயிற்றுநர். மாறிகள், நிபந்தனைகள், லூப்கள், ஸ்ட்ரிங்குகள், லிஸ்ட்கள், செயல்பாடுகள் பற்றிக் கேளுங்கள்.",
    thanks: "நன்றி! தொடர்ந்து பயிற்சி செய்யுங்கள் — சிறு படிகளும் பெரிதாகச் சேரும்.",
    meaning: "என்றால்",
  },
};

function findGlossaryTerm(text) {
  const lower = String(text || "").toLowerCase();
  return GLOSSARY.find((g) => new RegExp(`\\b${g.term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) || null;
}

function lessonText(topic, lang, { voice = false, style = "step_by_step" } = {}) {
  const parts = [`**${pick(topic.title, lang)}**`, pick(topic.simple, lang)];
  if (voice) return stripMarkdown(parts.slice(1).join(" "));
  if (style !== "simple") {
    parts.push(`**${T[lang].steps}**\n${pickList(topic.steps, lang).map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  }
  parts.push(`**${T[lang].example}**\n\`\`\`python\n${topic.example.code}\n\`\`\`\n${pick(topic.example.explain, lang)}`);
  if (style === "step_by_step") {
    parts.push(`**${T[lang].mistakes}**\n${pickList(topic.mistakes, lang).map((m) => `- ${m}`).join("\n")}`);
  }
  parts.push(T[lang].next);
  return parts.join("\n\n");
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function localTutorReply({ message, lang = "en", topicId = null, mode = "chat", style = "step_by_step", history = [] }) {
  const l = lang === "ta" ? "ta" : "en";
  const voice = mode === "voice";
  const text = String(message || "").trim();
  const lower = text.toLowerCase();

  if (/^(hi|hello|hey|vanakkam|வணக்கம்)\b/i.test(text)) return { reply: T[l].hello, topicId: null };
  if (/\b(thanks|thank you|nandri)\b/i.test(lower) || /நன்றி/.test(text)) return { reply: T[l].thanks, topicId: null };

  const followUp = /\b(another|example|more|explain that|what about|why|how does it)\b/i.test(text) || /மேலும்|எடுத்துக்காட்டு/.test(text);
  const previousTopic = followUp ? [...history].reverse().map((m) => classifyTopic(m.content)).find(Boolean) : null;
  const detected = classifyTopic(text) || topicId || previousTopic;
  const term = findGlossaryTerm(text);
  const asksDefinition = /\b(what is|what's|what are|meaning of|define|mean)\b/i.test(lower) || /என்றால்|என்ன/.test(text);

  if (term && (asksDefinition || !detected)) {
    const meaning = term[l] || term.en;
    const base = l === "ta" ? `**${term.term}** ${T.ta.meaning}: ${meaning}.` : `A **${term.term}** is ${meaning}.`;
    const topic = topicById(detected);
    const extra = topic && !voice ? `\n\n${lessonText(topic, l, { style: "simple" })}` : "";
    return { reply: voice ? stripMarkdown(base) : base + extra, topicId: topic ? topic.id : null };
  }

  const topic = topicById(detected);
  if (topic) return { reply: lessonText(topic, l, { voice, style }), topicId: topic.id };

  const list = TOPICS.map((t) => `- ${pick(t.title, l)}`).join("\n");
  const reply = voice
    ? `${T[l].unknown} ${TOPICS.map((t) => pick(t.title, l)).join(", ")}.`
    : `${T[l].unknown}\n${list}\n\n${T[l].needAi}`;
  return { reply, topicId: null };
}

// ---------------------------------------------------------------------------
// Simplifier
// ---------------------------------------------------------------------------
// Only splits where the next clause has its own subject, so no fragment is
// ever left without one ("Is an input..." style output).
const CLAUSE_SUBJECT = "(?=(?:it|they|this|that|you|we|he|she|the|a|an|each|every|there|these|those)\\b)";

function splitLongSentence(sentence, maxWords = 20) {
  if (sentence.split(/\s+/).length <= maxWords) return [sentence];
  const rewritten = sentence
    .replace(/;\s+/g, ". ")
    .replace(new RegExp(`,\\s+but\\s+${CLAUSE_SUBJECT}`, "gi"), ". But ")
    .replace(new RegExp(`,\\s+so\\s+${CLAUSE_SUBJECT}`, "gi"), ". So ")
    .replace(new RegExp(`,\\s+and\\s+${CLAUSE_SUBJECT}`, "gi"), ". ");
  return rewritten.split(/(?<=\.)\s+/).map((x) => x.trim()).filter(Boolean);
}

function capitalise(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function ensureEnd(s) {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

function localSimplify({ text, lang = "en", level = "simple" }) {
  const l = lang === "ta" ? "ta" : "en";
  const original = String(text || "").trim();

  // Keep code blocks out of the prose pipeline.
  const codeBlocks = [];
  const prose = original.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_m, language, code) => {
    codeBlocks.push({ language: language || "python", code: code.trim() });
    return " ";
  });

  let plain = prose;
  for (const [re, replacement] of PLAIN_WORDS) plain = plain.replace(re, replacement);
  plain = plain.replace(/\s+/g, " ").trim();

  const sentences = (plain.match(/[^.!?\n]+[.!?]?/g) || [])
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .flatMap((s) => splitLongSentence(s))
    .map((s) => ensureEnd(capitalise(s)));

  const topicId = classifyTopic(original);
  const topic = topicById(topicId);

  // Tamil rewriting of arbitrary text needs a language model. Offline, we can
  // still give a correct Tamil explanation whenever the text matches a lesson.
  let simple;
  let steps;
  let translated = false;
  let note = null;
  if (l === "ta" && topic) {
    simple = pick(topic.simple, "ta");
    steps = pickList(topic.steps, "ta");
    translated = true;
  } else {
    const limit = level === "very_simple" ? 3 : 6;
    simple = sentences.slice(0, limit).join(" ");
    steps = sentences.slice(0, 8);
    if (l === "ta") note = "ta-needs-ai";
  }

  const lowerOriginal = original.toLowerCase();
  const keyTerms = GLOSSARY.filter((g) =>
    new RegExp(`\\b${g.term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lowerOriginal)
  )
    .slice(0, 8)
    .map((g) => ({ term: g.term, meaning: g[l] || g.en }));

  let example = null;
  if (codeBlocks.length) {
    example = { code: codeBlocks[0].code, language: codeBlocks[0].language, explanation: l === "ta" && topic ? pick(topic.example.explain, "ta") : "" };
  } else if (topic) {
    example = { code: topic.example.code, language: "python", explanation: pick(topic.example.explain, l) };
  }

  return {
    simple: simple || ensureEnd(capitalise(plain.slice(0, 280))),
    steps: steps.length ? steps : [ensureEnd(capitalise(plain.slice(0, 200)))],
    example,
    keyTerms,
    topicId: topic ? topic.id : null,
    translated,
    note,
  };
}

module.exports = { localTutorReply, localSimplify, stripMarkdown };
