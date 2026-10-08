const crypto = require("crypto");
const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { roundsSupported } = require("../utils/featureSupport");
const {
  quizPublicShape,
  isMissingPlacementColumn,
  placementSetupError,
} = require("./adminQuizController");

// ----------------------------------------------------------------------------
// Quiz Copy / Paste
//
// "Copy" only records WHICH quiz the admin picked (the frontend keeps that
// reference in its clipboard); "Paste" clones that quiz on the server, straight
// from the database. Doing the clone server-side is deliberate:
//
//   * Nothing is lost. Every column of the quiz, its rounds, its questions and
//     its MCQ options is copied generically (`select *`), so columns added by
//     later migrations (coding test cases, fill-in-the-blank answers, per-
//     question timers, round qualification %, ...) are carried over without
//     this file having to know about them — and databases that are missing an
//     optional column still work, because only columns that exist are read.
//   * The quiz password hash never leaves the server. The copy keeps the SAME
//     password as the original, so the admin doesn't have to reset anything.
//   * There is no size limit to hit (the JSON body limit is 3 MB) no matter
//     how many questions or how much starter code a quiz contains.
//
// Only quiz CONTENT is copied. Student data — attempts, answers, attendance,
// timings, results — belongs to the original quiz and is never duplicated.
// ----------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEMENTS = ["quizzes", "landing"];

// Keep each request comfortably below PostgREST / proxy body limits even for
// quizzes full of long coding problems.
const QUESTION_CHUNK = 40;
const OPTION_CHUNK = 200;

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function withoutKeys(row, keys) {
  const copy = { ...row };
  keys.forEach((k) => delete copy[k]);
  return copy;
}

function assertUuid(value, label) {
  if (!UUID_RE.test(String(value || ""))) throw new ApiError(400, `Invalid ${label}`);
}

// Loads a quiz plus everything that belongs to its content.
async function loadQuizBundle(supabase, quizId) {
  assertUuid(quizId, "quiz id");

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", quizId)
    .maybeSingle();
  if (quizError) throw new ApiError(500, "Failed to load the quiz", quizError.message);
  if (!quiz) {
    throw new ApiError(404, "That quiz no longer exists (it may have been deleted). Copy it again from the list.");
  }

  let rounds = [];
  if (await roundsSupported()) {
    const { data, error } = await supabase
      .from("rounds")
      .select("*")
      .eq("quiz_id", quizId)
      .order("order_index", { ascending: true });
    if (error) throw new ApiError(500, "Failed to load the quiz's rounds", error.message);
    rounds = data || [];
  }

  const { data: questions, error: questionError } = await supabase
    .from("questions")
    .select("*, quiz_options(*)")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });
  if (questionError) throw new ApiError(500, "Failed to load the quiz's questions", questionError.message);

  return { quiz, rounds, questions: questions || [] };
}

function summarize({ quiz, rounds, questions }) {
  const optionCount = questions.reduce((sum, q) => sum + (q.quiz_options || []).length, 0);
  return {
    id: quiz.id,
    title: quiz.title,
    placement: quiz.placement || "quizzes",
    status: quiz.status,
    roundCount: rounds.length,
    questionCount: questions.length,
    optionCount,
  };
}

// GET /api/admin/quizzes/:id/copy-info
// Called when the admin presses "Copy Quiz": verifies the quiz exists and
// returns a summary the frontend shows on the clipboard ("3 rounds, 25
// questions, ..."). Read-only — nothing is written.
const getCopyInfo = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const bundle = await loadQuizBundle(supabase, req.params.id);
  res.json({ success: true, quiz: summarize(bundle) });
});

// POST /api/admin/quizzes/paste
// body: { sourceQuizId, placement: "quizzes" | "landing", title? }
//
// Creates a brand-new quiz (always as a draft, so a copy of a live quiz never
// goes live by accident) that is a complete copy of the source: quiz settings,
// rounds, questions, MCQ options / correct answers / marks / negative marks /
// timers / coding test cases / fill-in-the-blank answers — everything.
// `placement` decides where the copy lives, which is what makes copying work
// in both directions: Quiz -> Demo Quiz and Demo Quiz -> Quiz.
const pasteQuiz = asyncHandler(async (req, res) => {
  const body = req.body || {};
  assertUuid(body.sourceQuizId, "sourceQuizId");

  const placement = body.placement === undefined || body.placement === null ? "quizzes" : body.placement;
  if (!PLACEMENTS.includes(placement)) {
    throw new ApiError(400, 'placement must be either "quizzes" or "landing"');
  }

  let title = null;
  if (body.title !== undefined && body.title !== null) {
    title = String(body.title).trim();
    if (!title) throw new ApiError(400, "title cannot be empty");
  }

  const supabase = getSupabase();
  const bundle = await loadQuizBundle(supabase, body.sourceQuizId);
  const { quiz, rounds, questions } = bundle;

  // Client-generated ids let every child row point at its new parent without
  // depending on the order in which the database returns inserted rows.
  const newQuizId = crypto.randomUUID();
  const roundIdMap = new Map(rounds.map((r) => [r.id, crypto.randomUUID()]));

  const quizRow = {
    ...withoutKeys(quiz, ["id", "created_at", "updated_at"]),
    id: newQuizId,
    title: title || `${quiz.title} (Copy)`,
    status: "draft",
    placement,
  };

  // 1) The quiz itself. Same placement-column fallback as createQuiz: a
  //    database that hasn't run migration_landing_quizzes.sql can still paste
  //    a normal quiz, but pasting a Demo Quiz needs the migration.
  let { data: newQuiz, error: quizInsertError } = await supabase
    .from("quizzes")
    .insert(quizRow)
    .select("*")
    .single();
  if (quizInsertError && isMissingPlacementColumn(quizInsertError)) {
    if (placement === "landing") throw placementSetupError();
    const { placement: _omit, ...rowWithoutPlacement } = quizRow;
    ({ data: newQuiz, error: quizInsertError } = await supabase
      .from("quizzes")
      .insert(rowWithoutPlacement)
      .select("*")
      .single());
  }
  if (quizInsertError) throw new ApiError(500, "Failed to paste the quiz", quizInsertError.message);

  // 2) Rounds, questions and options. Supabase has no multi-statement
  //    transaction, so if anything below fails the half-built copy is deleted
  //    (rounds / questions / options all cascade from the quiz row) and the
  //    admin is left with exactly what they had before — never a broken quiz.
  const counts = { rounds: 0, questions: 0, options: 0 };
  try {
    if (rounds.length) {
      const roundRows = rounds.map((r) => ({
        ...withoutKeys(r, ["id", "created_at", "updated_at"]),
        id: roundIdMap.get(r.id),
        quiz_id: newQuizId,
      }));
      const { error } = await supabase.from("rounds").insert(roundRows);
      if (error) throw new ApiError(500, "Failed to paste the quiz's rounds", error.message);
      counts.rounds = roundRows.length;
    }

    const questionRows = [];
    const optionRows = [];
    questions.forEach((q) => {
      const newQuestionId = crypto.randomUUID();
      const { quiz_options: options, ...questionColumns } = q;
      const row = {
        ...withoutKeys(questionColumns, ["id", "created_at", "updated_at"]),
        id: newQuestionId,
        quiz_id: newQuizId,
      };
      // Point the question at the COPY of its round (or leave it unassigned).
      if ("round_id" in questionColumns) {
        row.round_id = q.round_id ? roundIdMap.get(q.round_id) || null : null;
      }
      questionRows.push(row);

      (options || []).forEach((o) => {
        optionRows.push({ ...withoutKeys(o, ["id"]), question_id: newQuestionId });
      });
    });

    for (const part of chunk(questionRows, QUESTION_CHUNK)) {
      const { error } = await supabase.from("questions").insert(part);
      if (error) throw new ApiError(500, "Failed to paste the quiz's questions", error.message);
    }
    counts.questions = questionRows.length;

    for (const part of chunk(optionRows, OPTION_CHUNK)) {
      const { error } = await supabase.from("quiz_options").insert(part);
      if (error) throw new ApiError(500, "Failed to paste the quiz's answer options", error.message);
    }
    counts.options = optionRows.length;
  } catch (err) {
    const { error: rollbackError } = await supabase.from("quizzes").delete().eq("id", newQuizId);
    if (rollbackError) {
      console.error("[pasteQuiz] rollback failed — remove quiz", newQuizId, "manually:", rollbackError.message);
    }
    throw err;
  }

  res.status(201).json({
    success: true,
    quiz: { ...quizPublicShape(newQuiz), questionCount: counts.questions, participantCount: 0 },
    copied: counts,
    source: { id: quiz.id, title: quiz.title, placement: quiz.placement || "quizzes" },
  });
});

module.exports = { getCopyInfo, pasteQuiz };
