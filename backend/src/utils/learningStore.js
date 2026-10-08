/**
 * Database access for the AI learning features. Every function takes the
 * Supabase client and an explicit student id (always taken from the verified
 * JWT by the callers) so one student can never read another's data.
 */
const { ApiError } = require("./asyncHandler");

const DEFAULT_ACCESSIBILITY = {
  textSize: "normal",
  highContrast: false,
  simplifiedText: false,
  reduceMotion: false,
  dyslexiaFriendly: false,
  keyboardMode: false,
};

const TEXT_SIZES = ["small", "normal", "large", "xlarge"];
const STYLES = ["simple", "step_by_step", "example"];
const LANGS = ["en", "ta"];

function isMissingTable(error) {
  const text = `${error?.message || ""} ${error?.details || ""} ${error?.code || ""}`.toLowerCase();
  return (
    /pgrst205|42p01/.test(text) ||
    (text.includes("does not exist") && /learning_profiles|topic_mastery|adaptive_|ai_tutor_logs/.test(text)) ||
    (text.includes("schema cache") && /learning_profiles|topic_mastery|adaptive_|ai_tutor_logs/.test(text))
  );
}

function setupError() {
  return new ApiError(
    503,
    "AI learning isn't set up in this database yet. In Supabase, run backend/sql/migration_ai_learning.sql (it's also included in schema.sql for new databases), then try again."
  );
}

function unwrap(result, what) {
  if (result.error) {
    if (isMissingTable(result.error)) throw setupError();
    throw new ApiError(500, `Failed to ${what}`, result.error.message);
  }
  return result.data;
}

function sanitizeAccessibility(input, base = DEFAULT_ACCESSIBILITY) {
  const src = input && typeof input === "object" ? input : {};
  const out = { ...base };
  if (TEXT_SIZES.includes(src.textSize)) out.textSize = src.textSize;
  for (const key of ["highContrast", "simplifiedText", "reduceMotion", "dyslexiaFriendly", "keyboardMode"]) {
    if (typeof src[key] === "boolean") out[key] = src[key];
  }
  return out;
}

function levelFromXp(xp) {
  const n = Math.max(0, Number(xp) || 0);
  const level = Math.floor(Math.sqrt(n / 50)) + 1;
  const floor = 50 * (level - 1) ** 2;
  const ceiling = 50 * level ** 2;
  return { level, xpIntoLevel: n - floor, xpForNext: ceiling - floor };
}

function toProfilePayload(row) {
  const xp = Number(row?.xp) || 0;
  return {
    language: LANGS.includes(row?.preferred_language) ? row.preferred_language : "en",
    style: STYLES.includes(row?.explanation_style) ? row.explanation_style : "step_by_step",
    goal: row?.goal || "",
    accessibility: sanitizeAccessibility(row?.accessibility),
    xp,
    streakDays: Number(row?.streak_days) || 0,
    lastActiveDate: row?.last_active_date || null,
    totalPracticeAnswers: Number(row?.total_practice_answers) || 0,
    ...levelFromXp(xp),
  };
}

async function getProfileRow(supabase, studentId) {
  const result = await supabase.from("learning_profiles").select("*").eq("student_id", studentId).maybeSingle();
  return unwrap(result, "load your learning profile");
}

async function ensureProfileRow(supabase, studentId) {
  const existing = await getProfileRow(supabase, studentId);
  if (existing) return existing;
  const inserted = await supabase.from("learning_profiles").insert({ student_id: studentId }).select("*").single();
  if (inserted.error) {
    // Two requests can race to create the first row; the loser just re-reads.
    const again = await getProfileRow(supabase, studentId);
    if (again) return again;
    unwrap(inserted, "create your learning profile");
  }
  return inserted.data;
}

async function updateProfileRow(supabase, studentId, patch) {
  await ensureProfileRow(supabase, studentId);
  const result = await supabase
    .from("learning_profiles")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("student_id", studentId)
    .select("*")
    .single();
  return unwrap(result, "update your learning profile");
}

async function listMastery(supabase, studentId) {
  const result = await supabase.from("topic_mastery").select("*").eq("student_id", studentId);
  return unwrap(result, "load topic mastery") || [];
}

async function upsertMastery(supabase, row) {
  const result = await supabase
    .from("topic_mastery")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "student_id,topic_id" });
  unwrap(result, "save topic mastery");
}

async function recentAnsweredQuestionIds(supabase, studentId, limit = 40) {
  const result = await supabase
    .from("adaptive_answers")
    .select("question_id, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (unwrap(result, "load recent answers") || []).map((r) => r.question_id);
}

async function tutorTopicCounts(supabase, studentId) {
  const result = await supabase
    .from("ai_tutor_logs")
    .select("topic_id")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(300);
  const counts = {};
  for (const r of unwrap(result, "load tutor history") || []) {
    if (r.topic_id) counts[r.topic_id] = (counts[r.topic_id] || 0) + 1;
  }
  return counts;
}

module.exports = {
  DEFAULT_ACCESSIBILITY,
  TEXT_SIZES,
  STYLES,
  LANGS,
  isMissingTable,
  setupError,
  unwrap,
  sanitizeAccessibility,
  levelFromXp,
  toProfilePayload,
  getProfileRow,
  ensureProfileRow,
  updateProfileRow,
  listMastery,
  upsertMastery,
  recentAnsweredQuestionIds,
  tutorTopicCounts,
};
