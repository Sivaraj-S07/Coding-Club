const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const {
  roundsSupported,
  questionTimeLimitSupported,
  codingJudgeSupported,
} = require("../utils/featureSupport");
const { SUPPORTED_LANGUAGES, clampTimeLimit } = require("../utils/codeRunner");

const LANGUAGES = SUPPORTED_LANGUAGES;

// Sample I/O is shown to the student; test cases are the hidden answer key.
function normalizeSampleIo(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((s) => ({
      input: String(s?.input ?? ""),
      output: String(s?.output ?? ""),
      explanation: String(s?.explanation ?? ""),
    }))
    .filter((s) => s.input.trim() !== "" || s.output.trim() !== "");
}

function normalizeTestCases(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((t, i) => ({
      name: String(t?.name ?? `Test case ${i + 1}`).slice(0, 80),
      input: String(t?.input ?? ""),
      expectedOutput: String(t?.expectedOutput ?? t?.output ?? ""),
      hidden: t?.hidden === false ? false : true,
    }))
    .filter((t) => t.expectedOutput.trim() !== "" || t.input.trim() !== "");
}

function normalizeLanguages(list, fallback) {
  const values = (Array.isArray(list) ? list : []).filter((l) => LANGUAGES.includes(l));
  if (values.length) return [...new Set(values)];
  return LANGUAGES.includes(fallback) ? [fallback] : [];
}

function questionShape(q) {
  const type = q.question_type || "mcq";
  return {
    id: q.id,
    quizId: q.quiz_id,
    roundId: q.round_id || null,
    type,
    text: q.question_text,
    marks: q.marks,
    negativeMarks: q.negative_marks,
    order: q.order_index,
    timeLimitSeconds: q.time_limit_seconds ?? null,
    language: q.language || null,
    starterCode: q.starter_code || null,
    expectedOutput: q.expected_output || null,
    referenceSolution: q.reference_solution || null,
    problemStatement: q.problem_statement || "",
    inputFormat: q.input_format || "",
    outputFormat: q.output_format || "",
    constraintsText: q.constraints_text || "",
    sampleIo: Array.isArray(q.sample_io) ? q.sample_io : [],
    testCases: Array.isArray(q.test_cases) ? q.test_cases : [],
    timeLimitMs: q.time_limit_ms ? Number(q.time_limit_ms) : 3000,
    allowedLanguages: Array.isArray(q.allowed_languages) && q.allowed_languages.length
      ? q.allowed_languages
      : q.language
        ? [q.language]
        : [],
    blankAnswers: type === "fill_blank" ? q.blank_answers || [[]] : [],
    caseSensitive: !!q.case_sensitive,
    options:
      type === "mcq"
        ? (q.quiz_options || [])
            .sort((a, b) => a.order_index - b.order_index)
            .map((o) => ({ id: o.id, text: o.option_text, isCorrect: o.is_correct }))
        : [],
  };
}

const QUESTION_TYPES = ["mcq", "coding", "fill_blank"];

function resolveType(rawType) {
  return QUESTION_TYPES.includes(rawType) ? rawType : "mcq";
}

// Normalizes the admin's blank-answers input into `[[accepted, answers], ...]`,
// one entry per blank, dropping empty accepted-answer strings.
function normalizeBlankAnswers(blankAnswers) {
  if (!Array.isArray(blankAnswers)) return [];
  return blankAnswers.map((accepted) =>
    (Array.isArray(accepted) ? accepted : [accepted])
      .map((a) => String(a ?? "").trim())
      .filter(Boolean)
  );
}

const listQuestions = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("questions")
    .select("*, quiz_options(*)")
    .eq("quiz_id", req.params.quizId)
    .order("order_index", { ascending: true });
  if (error) throw new ApiError(500, "Failed to load questions", error.message);

  let questions = (data || []).map(questionShape);

  // Group questions by round so the builder can render them round-by-round.
  if (await roundsSupported()) {
    const { data: rounds } = await supabase
      .from("rounds")
      .select("id, order_index")
      .eq("quiz_id", req.params.quizId)
      .order("order_index", { ascending: true });
    const rank = new Map((rounds || []).map((r, i) => [r.id, i]));
    questions = questions
      .map((q, i) => ({ q, i }))
      .sort((a, b) => {
        // Unassigned questions (no round) always sort last.
        const ra = a.q.roundId ? rank.get(a.q.roundId) ?? 9998 : 9999;
        const rb = b.q.roundId ? rank.get(b.q.roundId) ?? 9998 : 9999;
        if (ra !== rb) return ra - rb;
        if (a.q.order !== b.q.order) return a.q.order - b.q.order;
        return a.i - b.i;
      })
      .map((x) => x.q);
  }

  res.json({ success: true, questions });
});

function validateQuestionPayload(body) {
  const errors = [];
  const type = resolveType(body.type);

  if (!body.text || !String(body.text).trim()) errors.push("text is required");
  if (body.marks !== undefined && Number(body.marks) <= 0) errors.push("marks must be greater than 0");
  if (body.negativeMarks !== undefined && body.negativeMarks !== null && body.negativeMarks !== "") {
    const negative = Number(body.negativeMarks);
    if (!Number.isFinite(negative) || negative < 0) errors.push("negativeMarks cannot be negative");
    if (Number.isFinite(negative) && body.marks !== undefined && negative > Number(body.marks))
      errors.push("negativeMarks cannot be greater than marks");
  }
  if (body.timeLimitSeconds !== undefined && body.timeLimitSeconds !== null && body.timeLimitSeconds !== "") {
    const limit = Number(body.timeLimitSeconds);
    if (!Number.isFinite(limit) || limit < 0 || limit > 7200)
      errors.push("timeLimitSeconds must be between 0 (no limit) and 7200");
  }

  if (type === "mcq") {
    if (!Array.isArray(body.options) || body.options.length < 2)
      errors.push("at least 2 options are required");
    if (Array.isArray(body.options)) {
      const correctCount = body.options.filter((o) => o.isCorrect).length;
      if (correctCount !== 1) errors.push("exactly one option must be marked correct");
      body.options.forEach((o, i) => {
        if (!o.text || !String(o.text).trim()) errors.push(`option ${i + 1} text is required`);
      });
    }
  } else if (type === "coding") {
    if (!LANGUAGES.includes(body.language)) {
      errors.push("language must be one of c, cpp, java, python");
    }
    const hasExpectedOutput = body.expectedOutput && String(body.expectedOutput).trim();
    const hasReferenceSolution = body.referenceSolution && String(body.referenceSolution).trim();
    const tests = normalizeTestCases(body.testCases);
    if (!tests.length && !hasExpectedOutput && !hasReferenceSolution) {
      errors.push("add at least one hidden test case (or an expected output) to grade submissions against");
    }
    tests.forEach((t, i) => {
      if (!String(t.expectedOutput).trim()) errors.push(`test case ${i + 1} needs an expected output`);
    });
    if (body.timeLimitMs !== undefined && body.timeLimitMs !== null && body.timeLimitMs !== "") {
      const ms = Number(body.timeLimitMs);
      if (!Number.isFinite(ms) || ms < 500 || ms > 99999)
        errors.push("timeLimitMs must be between 500 and 99999");
    }
  } else if (type === "fill_blank") {
    const blanks = normalizeBlankAnswers(body.blankAnswers);
    if (!blanks.length) errors.push("at least one blank is required");
    blanks.forEach((accepted, i) => {
      if (!accepted.length) errors.push(`blank ${i + 1} needs at least one accepted answer`);
    });
  }

  if (errors.length) throw new ApiError(400, "Validation failed", errors);
}

// Normalizes the admin's per-question time limit. 0 / empty / null all mean
// "no per-question limit".
function normalizeTimeLimit(value) {
  if (value === undefined || value === null || value === "") return null;
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(seconds, 7200);
}

const createQuestion = asyncHandler(async (req, res) => {
  const body = req.body || {};
  validateQuestionPayload(body);
  const type = resolveType(body.type);
  const supabase = getSupabase();

  const supportsRounds = await roundsSupported();
  const supportsTimeLimit = await questionTimeLimitSupported();
  const supportsJudge = await codingJudgeSupported();
  const roundId = supportsRounds && body.roundId ? body.roundId : null;

  // order_index is scoped to the round the question belongs to, so each round
  // numbers its questions from 1 independently.
  let countQuery = supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", req.params.quizId);
  if (supportsRounds) {
    countQuery = roundId ? countQuery.eq("round_id", roundId) : countQuery.is("round_id", null);
  }
  const { count, error: countError } = await countQuery;
  if (countError) {
    console.error("[createQuestion] question count lookup failed:", countError);
    throw new ApiError(500, "Failed to create question", countError.message);
  }

  const { data: question, error: qError } = await supabase
    .from("questions")
    .insert({
      quiz_id: req.params.quizId,
      ...(supportsRounds ? { round_id: roundId } : {}),
      ...(supportsTimeLimit ? { time_limit_seconds: normalizeTimeLimit(body.timeLimitSeconds) } : {}),
      question_text: String(body.text).trim(),
      marks: Number(body.marks ?? 1),
      negative_marks: Math.max(0, Number(body.negativeMarks ?? 0) || 0),
      order_index: count || 0,
      question_type: type,
      language: type === "coding" ? body.language : null,
      starter_code: type === "coding" ? body.starterCode || null : null,
      expected_output: type === "coding" ? body.expectedOutput || null : null,
      reference_solution: type === "coding" ? body.referenceSolution || null : null,
      ...(supportsJudge
        ? {
            problem_statement: type === "coding" ? body.problemStatement || null : null,
            input_format: type === "coding" ? body.inputFormat || null : null,
            output_format: type === "coding" ? body.outputFormat || null : null,
            constraints_text: type === "coding" ? body.constraintsText || null : null,
            sample_io: type === "coding" ? normalizeSampleIo(body.sampleIo) : [],
            test_cases: type === "coding" ? normalizeTestCases(body.testCases) : [],
            time_limit_ms: type === "coding" ? clampTimeLimit(body.timeLimitMs) : 3000,
            allowed_languages:
              type === "coding" ? normalizeLanguages(body.allowedLanguages, body.language) : [],
          }
        : {}),
      blank_answers: type === "fill_blank" ? normalizeBlankAnswers(body.blankAnswers) : null,
      case_sensitive: type === "fill_blank" ? !!body.caseSensitive : false,
    })
    .select("*")
    .single();
  if (qError) {
    console.error("[createQuestion] insert into questions failed:", qError);
    throw new ApiError(500, "Failed to create question", qError.message);
  }

  if (type === "mcq") {
    const optionRows = body.options.map((o, idx) => ({
      question_id: question.id,
      option_text: String(o.text).trim(),
      is_correct: !!o.isCorrect,
      order_index: idx,
    }));
    const { data: options, error: oError } = await supabase
      .from("quiz_options")
      .insert(optionRows)
      .select("*");
    if (oError) {
      console.error("[createQuestion] insert into quiz_options failed:", oError);
      throw new ApiError(500, "Failed to create options", oError.message);
    }
    return res.status(201).json({
      success: true,
      question: questionShape({ ...question, quiz_options: options }),
      timeLimitApplied: supportsTimeLimit,
    });
  }

  res.status(201).json({
    success: true,
    question: questionShape({ ...question, quiz_options: [] }),
    timeLimitApplied: supportsTimeLimit,
  });
});

const updateQuestion = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const supabase = getSupabase();

  const { data: existing, error: existingError } = await supabase
    .from("questions")
    .select("question_type")
    .eq("id", req.params.id)
    .maybeSingle();
  if (existingError) throw new ApiError(500, "Failed to load question", existingError.message);
  if (!existing) throw new ApiError(404, "Question not found");

  const type = body.type !== undefined ? resolveType(body.type) : existing.question_type || "mcq";
  const supportsRounds = await roundsSupported();
  const supportsTimeLimit = await questionTimeLimitSupported();
  const supportsJudge = await codingJudgeSupported();

  if (supportsRounds && body.roundId !== undefined) {
    const { error: moveError } = await supabase
      .from("questions")
      .update({ round_id: body.roundId || null })
      .eq("id", req.params.id);
    if (moveError) throw new ApiError(500, "Failed to move question to round", moveError.message);
  }

  if (
    body.text !== undefined ||
    body.marks !== undefined ||
    body.negativeMarks !== undefined ||
    body.type !== undefined ||
    body.language !== undefined ||
    body.starterCode !== undefined ||
    body.expectedOutput !== undefined ||
    body.referenceSolution !== undefined ||
    body.blankAnswers !== undefined ||
    body.caseSensitive !== undefined ||
    body.problemStatement !== undefined ||
    body.inputFormat !== undefined ||
    body.outputFormat !== undefined ||
    body.constraintsText !== undefined ||
    body.sampleIo !== undefined ||
    body.testCases !== undefined ||
    body.timeLimitMs !== undefined ||
    body.allowedLanguages !== undefined ||
    body.timeLimitSeconds !== undefined
  ) {
    const updateFields = {
      ...(body.text !== undefined ? { question_text: String(body.text).trim() } : {}),
      ...(body.marks !== undefined ? { marks: Number(body.marks) } : {}),
      ...(body.negativeMarks !== undefined ? { negative_marks: Number(body.negativeMarks) } : {}),
      ...(body.type !== undefined ? { question_type: type } : {}),
      ...(supportsTimeLimit && body.timeLimitSeconds !== undefined
        ? { time_limit_seconds: normalizeTimeLimit(body.timeLimitSeconds) }
        : {}),
      updated_at: new Date().toISOString(),
    };
    if (type === "coding") {
      if (body.language !== undefined) updateFields.language = body.language;
      if (body.starterCode !== undefined) updateFields.starter_code = body.starterCode;
      if (body.expectedOutput !== undefined) updateFields.expected_output = body.expectedOutput;
      if (body.referenceSolution !== undefined) updateFields.reference_solution = body.referenceSolution;
      if (supportsJudge) {
        if (body.problemStatement !== undefined) updateFields.problem_statement = body.problemStatement;
        if (body.inputFormat !== undefined) updateFields.input_format = body.inputFormat;
        if (body.outputFormat !== undefined) updateFields.output_format = body.outputFormat;
        if (body.constraintsText !== undefined) updateFields.constraints_text = body.constraintsText;
        if (body.sampleIo !== undefined) updateFields.sample_io = normalizeSampleIo(body.sampleIo);
        if (body.testCases !== undefined) updateFields.test_cases = normalizeTestCases(body.testCases);
        if (body.timeLimitMs !== undefined) updateFields.time_limit_ms = clampTimeLimit(body.timeLimitMs);
        if (body.allowedLanguages !== undefined)
          updateFields.allowed_languages = normalizeLanguages(body.allowedLanguages, body.language);
      }
    }
    if (type === "fill_blank") {
      if (body.blankAnswers !== undefined) updateFields.blank_answers = normalizeBlankAnswers(body.blankAnswers);
      if (body.caseSensitive !== undefined) updateFields.case_sensitive = !!body.caseSensitive;
    }

    const { error } = await supabase.from("questions").update(updateFields).eq("id", req.params.id);
    if (error) throw new ApiError(500, "Failed to update question", error.message);
  }

  if (type === "mcq" && Array.isArray(body.options)) {
    const correctCount = body.options.filter((o) => o.isCorrect).length;
    if (correctCount !== 1) throw new ApiError(400, "exactly one option must be marked correct");

    // Replace options wholesale — simplest correct approach for a small option set.
    await supabase.from("quiz_options").delete().eq("question_id", req.params.id);
    const optionRows = body.options.map((o, idx) => ({
      question_id: req.params.id,
      option_text: String(o.text).trim(),
      is_correct: !!o.isCorrect,
      order_index: idx,
    }));
    const { error: oError } = await supabase.from("quiz_options").insert(optionRows);
    if (oError) throw new ApiError(500, "Failed to update options", oError.message);
  }

  const { data: question, error: getError } = await supabase
    .from("questions")
    .select("*, quiz_options(*)")
    .eq("id", req.params.id)
    .maybeSingle();
  if (getError) throw new ApiError(500, "Failed to load question", getError.message);
  if (!question) throw new ApiError(404, "Question not found");

  res.json({ success: true, question: questionShape(question), timeLimitApplied: supportsTimeLimit });
});

const deleteQuestion = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { error } = await supabase.from("questions").delete().eq("id", req.params.id);
  if (error) throw new ApiError(500, "Failed to delete question", error.message);
  res.json({ success: true, message: "Question deleted" });
});

const reorderQuestions = asyncHandler(async (req, res) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new ApiError(400, "orderedIds must be a non-empty array of question ids");
  }
  const supabase = getSupabase();
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from("questions").update({ order_index: idx }).eq("id", id).eq("quiz_id", req.params.quizId)
    )
  );
  res.json({ success: true, message: "Question order updated" });
});

module.exports = {
  listQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  // Shared with utils/quizTransfer.js (PDF Import / Export) so an imported
  // quiz is validated and normalised by exactly the same rules as questions
  // created by hand in the builder.
  QUESTION_TYPES,
  validateQuestionPayload,
  normalizeSampleIo,
  normalizeTestCases,
  normalizeLanguages,
  normalizeBlankAnswers,
  normalizeTimeLimit,
};
