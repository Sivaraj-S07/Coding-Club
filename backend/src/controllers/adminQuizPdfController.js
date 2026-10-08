const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const {
  roundsSupported,
  roundQualificationSupported,
  questionTimeLimitSupported,
  codingJudgeSupported,
} = require("../utils/featureSupport");
const {
  quizPublicShape,
  isMissingPlacementColumn,
  placementSetupError,
} = require("./adminQuizController");
const { buildExportDocument, normalizeImportDocument, buildInsertRows } = require("../utils/quizTransfer");

// ----------------------------------------------------------------------------
// Quiz PDF Import / Export
//
//   POST /api/admin/quizzes/:id/export   -> the quiz as a transfer document
//   POST /api/admin/quizzes/import       -> recreate a quiz from that document
//
// The browser turns the document into a PDF (readable pages + the document
// embedded as a file attachment) and, on import, extracts it from the uploaded
// PDF again. All the real work happens here on the server:
//
//   * The document is validated with the SAME rules as the quiz builder, so an
//     imported quiz can never contain something the portal would have refused.
//   * Nothing is written unless every check passes. `dryRun: true` runs all of
//     the checks and returns a preview without touching the database.
//   * Writing is all-or-nothing: if any step fails the half-built quiz is
//     deleted (rounds / questions / options cascade from it), like Paste Quiz.
//   * Only quiz CONTENT moves. Attempts, answers, attendance and results never
//     leave the original quiz.
// ----------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEMENTS = ["quizzes", "landing"];
const STATUS_MODES = ["draft", "keep"];

// Keep every request comfortably below PostgREST / proxy body limits even for
// quizzes full of long coding problems.
const QUESTION_CHUNK = 25;
const OPTION_CHUNK = 200;

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function assertUuid(value, label) {
  if (!UUID_RE.test(String(value || ""))) throw new ApiError(400, `Invalid ${label}`);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

// POST /api/admin/quizzes/:id/export
// body: { password?: string }
//
// A quiz password is stored ONLY as a one-way hash, so it cannot be read back
// out of the database. To print it in the PDF the admin types it and it is
// verified here against the stored hash (nothing new is stored anywhere).
// Without it the PDF still restores the same password on import: the hash
// itself travels inside the PDF.
const exportQuiz = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, "quiz id");
  const body = req.body || {};
  if (body.password !== undefined && body.password !== null && typeof body.password !== "string") {
    throw new ApiError(400, "password must be text");
  }

  const supabase = getSupabase();

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();
  if (quizError) throw new ApiError(500, "Failed to load the quiz", quizError.message);
  if (!quiz) throw new ApiError(404, "That quiz no longer exists (it may have been deleted).");

  let plainPassword = null;
  if (typeof body.password === "string" && body.password !== "") {
    let matches = false;
    try {
      matches = await bcrypt.compare(body.password, String(quiz.password_hash || ""));
    } catch {
      matches = false;
    }
    if (!matches) {
      throw new ApiError(
        400,
        "That isn't this quiz's password. Re-type it, or leave the password box empty to export without printing it."
      );
    }
    plainPassword = body.password;
  }

  const roundsEnabled = await roundsSupported();
  let rounds = [];
  if (roundsEnabled) {
    const { data, error } = await supabase
      .from("rounds")
      .select("*")
      .eq("quiz_id", quiz.id)
      .order("order_index", { ascending: true });
    if (error) throw new ApiError(500, "Failed to load the quiz's rounds", error.message);
    rounds = data || [];
  }

  const { data: questions, error: questionError } = await supabase
    .from("questions")
    .select("*, quiz_options(*)")
    .eq("quiz_id", quiz.id)
    .order("order_index", { ascending: true });
  if (questionError) throw new ApiError(500, "Failed to load the quiz's questions", questionError.message);

  const document = buildExportDocument(
    { quiz, rounds, questions: questions || [] },
    { plainPassword, roundsEnabled }
  );

  // The response can contain the readable quiz password.
  res.set("Cache-Control", "no-store");
  res.json({ success: true, document, passwordIncluded: !!plainPassword });
});

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

// Importing into a database that lacks a column the quiz needs would quietly
// drop data (e.g. rounds or hidden test cases). Refuse instead, and say
// exactly which migration to run.
function assertDatabaseCanHoldQuiz(needs, supports) {
  const problems = [];
  if (needs.rounds && !supports.rounds) {
    problems.push("Rounds: run backend/sql/schema.sql in the Supabase SQL Editor.");
  }
  if (needs.qualification && !supports.qualification) {
    problems.push("Round qualification percentages: run backend/sql/migration_rounds_and_notifications.sql.");
  }
  if (needs.timeLimits && !supports.timeLimits) {
    problems.push("Per-question timers: run backend/sql/schema.sql in the Supabase SQL Editor.");
  }
  if (needs.judge && !supports.judge) {
    problems.push("Programming test cases and problem details: run backend/sql/migration_programming_judge.sql.");
  }
  if (problems.length) {
    throw new ApiError(
      409,
      "This database isn't set up for everything in this quiz yet, so importing it now would lose data. Apply the following, then import again.",
      problems
    );
  }
}

// POST /api/admin/quizzes/import
// body: {
//   document,                      // the transfer document read from the PDF
//   placement: "quizzes"|"landing",// which list the new quiz lives in
//   title?, password?,             // optional overrides
//   status?: "draft"|"keep",       // "keep" restores the exported status
//   dryRun?: boolean               // validate + preview only, write nothing
// }
const importQuiz = asyncHandler(async (req, res) => {
  const body = req.body || {};

  const placement = body.placement === undefined || body.placement === null ? "quizzes" : body.placement;
  if (!PLACEMENTS.includes(placement)) throw new ApiError(400, 'placement must be either "quizzes" or "landing"');

  const statusMode = body.status === undefined || body.status === null ? "draft" : body.status;
  if (!STATUS_MODES.includes(statusMode)) throw new ApiError(400, 'status must be either "draft" or "keep"');

  const dryRun = body.dryRun === true;

  const parsed = normalizeImportDocument(body.document);

  let title = parsed.quiz.title;
  if (body.title !== undefined && body.title !== null) {
    title = String(body.title).trim();
    if (!title) throw new ApiError(400, "title cannot be empty");
    if (title.length > 300) throw new ApiError(400, "title is too long (max 300 characters)");
  }

  if (body.password !== undefined && body.password !== null && typeof body.password !== "string") {
    throw new ApiError(400, "password must be text");
  }
  const providedPassword = typeof body.password === "string" && body.password !== "" ? body.password : null;

  // Where the imported quiz's password will come from.
  //   provided — typed by the admin during import
  //   plain    — printed in the PDF (admin typed it when exporting)
  //   hash     — carried inside the PDF as a one-way hash (same password)
  //   none     — the PDF has nothing usable; the admin must supply one
  const passwordSource = providedPassword
    ? "provided"
    : parsed.password.plain
      ? "plain"
      : parsed.password.hash
        ? "hash"
        : "none";

  const supports = {
    rounds: await roundsSupported(),
    qualification: await roundQualificationSupported(),
    timeLimits: await questionTimeLimitSupported(),
    judge: await codingJudgeSupported(),
  };
  assertDatabaseCanHoldQuiz(parsed.needs, supports);

  const supabase = getSupabase();

  // Demo Quizzes need the `placement` column — say so up front rather than
  // after the admin has waited for an upload.
  if (placement === "landing") {
    const probe = await supabase.from("quizzes").select("placement").limit(1);
    if (probe.error && isMissingPlacementColumn(probe.error)) throw placementSetupError();
  }

  const status = statusMode === "keep" ? parsed.quiz.status : "draft";
  const summary = {
    title,
    description: parsed.quiz.description,
    placement,
    status,
    exportedStatus: parsed.quiz.status,
    durationMinutes: parsed.quiz.durationMinutes,
    startTime: parsed.quiz.startTime,
    endTime: parsed.quiz.endTime,
    maxMarks: parsed.quiz.maxMarks,
    passingPercentage: parsed.quiz.passingPercentage,
    passwordSource,
    roundCount: parsed.counts.rounds,
    questionCount: parsed.counts.questions,
    optionCount: parsed.counts.options,
    totalMarks: parsed.counts.totalMarks,
    questionTypes: parsed.counts.types,
  };

  if (dryRun) {
    return res.json({ success: true, dryRun: true, summary, warnings: parsed.warnings });
  }

  if (passwordSource === "none") {
    throw new ApiError(
      400,
      "This PDF was exported without a password, so the imported quiz needs one. Enter a password for the new quiz and try again.",
      ["password"]
    );
  }

  const passwordHash =
    passwordSource === "hash"
      ? parsed.password.hash
      : await bcrypt.hash(providedPassword || parsed.password.plain, 10);

  const newQuizId = crypto.randomUUID();
  const { quizRow, roundRows, questionRows, optionRows } = buildInsertRows(parsed, {
    quizId: newQuizId,
    passwordHash,
    title,
    status,
    placement,
    supports,
    newId: () => crypto.randomUUID(),
  });

  // 1) The quiz itself. Same placement-column fallback as createQuiz / paste:
  //    a normal quiz still imports on a database that hasn't run
  //    migration_landing_quizzes.sql.
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
  if (quizInsertError) throw new ApiError(500, "Failed to import the quiz", quizInsertError.message);

  // 2) Rounds, questions and options. Supabase has no multi-statement
  //    transaction, so on any failure the half-built quiz is deleted (its
  //    children cascade) and the admin is left exactly as before.
  try {
    if (roundRows.length) {
      const { error } = await supabase.from("rounds").insert(roundRows);
      if (error) throw new ApiError(500, "Failed to import the quiz's rounds", error.message);
    }
    for (const part of chunk(questionRows, QUESTION_CHUNK)) {
      const { error } = await supabase.from("questions").insert(part);
      if (error) throw new ApiError(500, "Failed to import the quiz's questions", error.message);
    }
    for (const part of chunk(optionRows, OPTION_CHUNK)) {
      const { error } = await supabase.from("quiz_options").insert(part);
      if (error) throw new ApiError(500, "Failed to import the quiz's answer options", error.message);
    }
  } catch (err) {
    const { error: rollbackError } = await supabase.from("quizzes").delete().eq("id", newQuizId);
    if (rollbackError) {
      console.error("[importQuiz] rollback failed — remove quiz", newQuizId, "manually:", rollbackError.message);
    }
    throw err;
  }

  res.status(201).json({
    success: true,
    quiz: { ...quizPublicShape(newQuiz), questionCount: questionRows.length, participantCount: 0 },
    imported: { rounds: roundRows.length, questions: questionRows.length, options: optionRows.length },
    summary,
    warnings: parsed.warnings,
  });
});

module.exports = { exportQuiz, importQuiz };
