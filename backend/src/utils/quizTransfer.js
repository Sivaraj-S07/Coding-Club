const { ApiError } = require("./asyncHandler");
const { clampTimeLimit } = require("./codeRunner");
const {
  QUESTION_TYPES,
  validateQuestionPayload,
  normalizeSampleIo,
  normalizeTestCases,
  normalizeLanguages,
  normalizeBlankAnswers,
  normalizeTimeLimit,
} = require("../controllers/adminQuestionController");

// ----------------------------------------------------------------------------
// Quiz transfer document (PDF Import / Export)
//
// "Export PDF" produces a PDF that a person can read AND that carries the whole
// quiz as a small machine-readable JSON document (a standard PDF file
// attachment). "Import Quiz from PDF" reads that document back and recreates
// the quiz. Everything in this file is pure (no database, no HTTP) so the exact
// same rules can be unit-tested and reused by the controller:
//
//   buildExportDocument()      DB rows          -> transfer document
//   normalizeImportDocument()  untrusted JSON   -> validated, normalised quiz
//
// The document is versioned (`format` + `version`) so the layout can evolve
// without older PDFs silently importing wrong data.
// ----------------------------------------------------------------------------

const FORMAT_ID = "eduverse-quiz";
const LEGACY_FORMAT_ID = "coding-club-quiz"; // Existing PDFs must remain importable.
const FORMAT_VERSION = 1;

const QUIZ_STATUSES = ["draft", "upcoming", "live", "completed"];
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

// Generous ceilings: far above any real quiz, but they stop a corrupt or
// hostile file from asking the server to insert millions of rows.
const LIMITS = {
  title: 300,
  roundName: 200,
  rounds: 200,
  questions: 2000,
  optionsPerQuestion: 50,
  maxReportedProblems: 40,
};

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function bad(message, details) {
  return new ApiError(400, message, details);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Same order the quiz builder shows: round by round (in round order), each
// round's questions by their own order, and questions without a round last.
function sortQuestionsLikeBuilder(questions, rounds, roundsEnabled) {
  const rank = new Map(rounds.map((r, i) => [r.id, i]));
  return questions
    .map((q, i) => ({ q, i }))
    .sort((a, b) => {
      if (roundsEnabled) {
        const ra = a.q.round_id ? rank.get(a.q.round_id) ?? 9998 : 9999;
        const rb = b.q.round_id ? rank.get(b.q.round_id) ?? 9998 : 9999;
        if (ra !== rb) return ra - rb;
      }
      const oa = toNumber(a.q.order_index);
      const ob = toNumber(b.q.order_index);
      if (oa !== ob) return oa - ob;
      return a.i - b.i;
    })
    .map((x) => x.q);
}

function exportQuestion(q, roundIndexById) {
  const type = QUESTION_TYPES.includes(q.question_type) ? q.question_type : "mcq";
  const base = {
    roundIndex: q.round_id && roundIndexById.has(q.round_id) ? roundIndexById.get(q.round_id) : null,
    type,
    text: q.question_text ?? "",
    marks: toNumber(q.marks, 1),
    negativeMarks: toNumber(q.negative_marks, 0),
    timeLimitSeconds: q.time_limit_seconds ? toNumber(q.time_limit_seconds) : null,
  };

  if (type === "mcq") {
    const options = [...(q.quiz_options || [])].sort((a, b) => toNumber(a.order_index) - toNumber(b.order_index));
    return {
      ...base,
      options: options.map((o) => ({ text: o.option_text ?? "", isCorrect: !!o.is_correct })),
    };
  }

  if (type === "coding") {
    const allowed =
      Array.isArray(q.allowed_languages) && q.allowed_languages.length
        ? q.allowed_languages
        : q.language
          ? [q.language]
          : [];
    return {
      ...base,
      language: q.language || null,
      allowedLanguages: allowed,
      problemStatement: q.problem_statement || "",
      inputFormat: q.input_format || "",
      outputFormat: q.output_format || "",
      constraintsText: q.constraints_text || "",
      sampleIo: Array.isArray(q.sample_io) ? q.sample_io : [],
      testCases: Array.isArray(q.test_cases) ? q.test_cases : [],
      timeLimitMs: q.time_limit_ms ? toNumber(q.time_limit_ms, 3000) : 3000,
      starterCode: q.starter_code || null,
      expectedOutput: q.expected_output || null,
      referenceSolution: q.reference_solution || null,
    };
  }

  // fill_blank
  return {
    ...base,
    blankAnswers: Array.isArray(q.blank_answers) ? q.blank_answers : [[]],
    caseSensitive: !!q.case_sensitive,
  };
}

/**
 * Turns a quiz (as loaded from the database, with its rounds and questions +
 * options) into the transfer document that is embedded in the exported PDF.
 *
 * The quiz password is only ever stored as a one-way bcrypt hash, so the
 * readable password can be included ONLY when the admin typed it at export
 * time and it was verified (`plainPassword`). Otherwise the hash itself is
 * carried, which lets the import restore the very same password without the
 * password ever being readable.
 */
function buildExportDocument({ quiz, rounds = [], questions = [] }, { plainPassword = null, roundsEnabled = true, now = new Date() } = {}) {
  const orderedRounds = [...rounds].sort((a, b) => toNumber(a.order_index) - toNumber(b.order_index));
  const roundIndexById = new Map(orderedRounds.map((r, i) => [r.id, i]));
  const orderedQuestions = sortQuestionsLikeBuilder(questions, orderedRounds, roundsEnabled);

  const exportedQuestions = orderedQuestions.map((q) => exportQuestion(q, roundIndexById));
  const optionCount = exportedQuestions.reduce((sum, q) => sum + (q.options ? q.options.length : 0), 0);
  const totalMarks = exportedQuestions.reduce((sum, q) => sum + q.marks, 0);

  return {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    exportedAt: now.toISOString(),
    quiz: {
      title: quiz.title,
      description: quiz.description || "",
      password: plainPassword || null,
      passwordHash: plainPassword ? null : quiz.password_hash || null,
      durationMinutes: toNumber(quiz.duration_minutes, 30),
      startTime: quiz.start_time || null,
      endTime: quiz.end_time || null,
      maxMarks: toNumber(quiz.max_marks, 0),
      passingPercentage: toNumber(quiz.passing_percentage, 40),
      maxAttempts: toNumber(quiz.max_attempts, 1),
      tabSwitchLimit: toNumber(quiz.tab_switch_limit, 3),
      randomizeQuestions: !!quiz.randomize_questions,
      randomizeOptions: !!quiz.randomize_options,
      autoSubmit: !!quiz.auto_submit,
      allowLateJoin: !!quiz.allow_late_join,
      showLeaderboard: !!quiz.show_leaderboard,
      status: QUIZ_STATUSES.includes(quiz.status) ? quiz.status : "draft",
      placement: quiz.placement === "landing" ? "landing" : "quizzes",
    },
    rounds: orderedRounds.map((r) => ({
      name: r.name,
      description: r.description || "",
      qualificationPercentage: toNumber(r.qualification_percentage, 0),
    })),
    questions: exportedQuestions,
    // Used on import to detect a truncated / hand-edited data block.
    stats: {
      roundCount: orderedRounds.length,
      questionCount: exportedQuestions.length,
      optionCount,
      totalMarks,
    },
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

// Reads a numeric field. Missing values use `fallback`; present-but-invalid
// values are reported (never silently replaced) so nothing is restored wrong.
function readNumber(value, label, errors, { fallback, min, max, integer = false, exclusiveMin = false } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) {
    errors.push(`${label} must be a number.`);
    return fallback;
  }
  if (integer && !Number.isInteger(n)) errors.push(`${label} must be a whole number.`);
  if (min !== undefined && (exclusiveMin ? n <= min : n < min)) {
    errors.push(exclusiveMin ? `${label} must be greater than ${min}.` : `${label} cannot be less than ${min}.`);
  }
  if (max !== undefined && n > max) errors.push(`${label} cannot be more than ${max}.`);
  return n;
}

function readBoolean(value, label, errors, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  errors.push(`${label} must be true or false.`);
  return fallback;
}

function readDate(value, label, errors) {
  if (value === undefined || value === null || value === "") return null;
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    errors.push(`${label} is not a valid date.`);
    return null;
  }
  return date.toISOString();
}

// Optional text: a string is kept exactly as written (code indentation, blank
// lines and all); anything else is treated as "not set".
function readText(value) {
  return typeof value === "string" ? value : null;
}

function normalizeQuizBlock(raw, errors) {
  if (!isObject(raw)) {
    errors.push("The quiz details are missing from this PDF.");
    return null;
  }

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) errors.push("The quiz name is missing.");
  else if (title.length > LIMITS.title) errors.push(`The quiz name is too long (max ${LIMITS.title} characters).`);

  const status = raw.status === undefined || raw.status === null ? "draft" : raw.status;
  if (!QUIZ_STATUSES.includes(status)) errors.push(`Quiz status must be one of ${QUIZ_STATUSES.join(", ")}.`);

  const quiz = {
    title,
    description: typeof raw.description === "string" ? raw.description : "",
    durationMinutes: readNumber(raw.durationMinutes, "Duration", errors, {
      fallback: 30,
      min: 0,
      exclusiveMin: true,
      integer: true,
    }),
    startTime: readDate(raw.startTime, "Start time", errors),
    endTime: readDate(raw.endTime, "End time", errors),
    maxMarks: readNumber(raw.maxMarks, "Maximum marks", errors, { fallback: 0, min: 0 }),
    passingPercentage: readNumber(raw.passingPercentage, "Passing percentage", errors, {
      fallback: 40,
      min: 0,
      max: 100,
    }),
    maxAttempts: readNumber(raw.maxAttempts, "Maximum attempts", errors, { fallback: 1, min: 0, integer: true }),
    tabSwitchLimit: readNumber(raw.tabSwitchLimit, "Tab switch limit", errors, { fallback: 3, min: 0, integer: true }),
    randomizeQuestions: readBoolean(raw.randomizeQuestions, "Randomize questions", errors, true),
    randomizeOptions: readBoolean(raw.randomizeOptions, "Randomize options", errors, true),
    autoSubmit: readBoolean(raw.autoSubmit, "Auto submit", errors, true),
    allowLateJoin: readBoolean(raw.allowLateJoin, "Allow late join", errors, false),
    showLeaderboard: readBoolean(raw.showLeaderboard, "Show leaderboard", errors, true),
    status: QUIZ_STATUSES.includes(status) ? status : "draft",
  };

  // Password: the readable one (verified at export time) wins; otherwise the
  // bcrypt hash keeps the original password working without exposing it.
  const plain = typeof raw.password === "string" && raw.password !== "" ? raw.password : null;
  const hash = typeof raw.passwordHash === "string" && BCRYPT_HASH_RE.test(raw.passwordHash) ? raw.passwordHash : null;

  return { quiz, password: { plain, hash } };
}

function normalizeRounds(rawRounds, errors) {
  if (rawRounds === undefined || rawRounds === null) return [];
  if (!Array.isArray(rawRounds)) {
    errors.push("The rounds list is not valid.");
    return [];
  }
  if (rawRounds.length > LIMITS.rounds) {
    errors.push(`A quiz can have at most ${LIMITS.rounds} rounds.`);
    return [];
  }
  return rawRounds.map((r, i) => {
    const label = `Round ${i + 1}`;
    if (!isObject(r)) {
      errors.push(`${label} is not valid.`);
      return { name: "", description: null, qualificationPercentage: 0 };
    }
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) errors.push(`${label}: the round name is missing.`);
    else if (name.length > LIMITS.roundName) errors.push(`${label}: the round name is too long.`);
    const qualification = readNumber(r.qualificationPercentage, `${label}: qualification percentage`, errors, {
      fallback: 0,
      min: 0,
      max: 100,
    });
    const description = typeof r.description === "string" && r.description.trim() ? r.description.trim() : null;
    return { name, description, qualificationPercentage: Math.round(qualification * 100) / 100 };
  });
}

function normalizeQuestion(raw, index, roundCount, errors) {
  const label = `Question ${index + 1}`;
  if (!isObject(raw)) {
    errors.push(`${label} is not valid.`);
    return null;
  }

  const localErrors = [];
  const type = raw.type === undefined || raw.type === null ? "mcq" : raw.type;
  if (!QUESTION_TYPES.includes(type)) {
    errors.push(`${label}: unknown question type "${String(raw.type).slice(0, 30)}".`);
    return null;
  }

  let roundIndex = null;
  if (raw.roundIndex !== undefined && raw.roundIndex !== null) {
    if (!Number.isInteger(raw.roundIndex) || raw.roundIndex < 0 || raw.roundIndex >= roundCount) {
      localErrors.push("it points to a round that does not exist.");
    } else {
      roundIndex = raw.roundIndex;
    }
  }

  const marks = readNumber(raw.marks, "marks", localErrors, { fallback: 1 });
  const negativeMarks = readNumber(raw.negativeMarks, "negative marks", localErrors, { fallback: 0 });
  const timeLimitSeconds = readNumber(raw.timeLimitSeconds, "time limit", localErrors, { fallback: null });

  // Shape the data exactly like the builder's request body and run it through
  // the builder's own validator, so an imported question can never be
  // something the portal itself would have refused to save.
  const body = {
    type,
    text: typeof raw.text === "string" ? raw.text : "",
    marks,
    negativeMarks,
    timeLimitSeconds,
  };

  if (type === "mcq") {
    if (raw.options !== undefined && !Array.isArray(raw.options)) localErrors.push("the answer options are not valid.");
    const options = Array.isArray(raw.options) ? raw.options : [];
    if (options.length > LIMITS.optionsPerQuestion) {
      localErrors.push(`it has more than ${LIMITS.optionsPerQuestion} answer options.`);
    }
    body.options = options.slice(0, LIMITS.optionsPerQuestion).map((o) => ({
      text: isObject(o) && typeof o.text === "string" ? o.text : "",
      isCorrect: isObject(o) && o.isCorrect === true,
    }));
  } else if (type === "coding") {
    body.language = raw.language;
    body.allowedLanguages = raw.allowedLanguages;
    body.starterCode = readText(raw.starterCode);
    body.expectedOutput = readText(raw.expectedOutput);
    body.referenceSolution = readText(raw.referenceSolution);
    body.problemStatement = readText(raw.problemStatement);
    body.inputFormat = readText(raw.inputFormat);
    body.outputFormat = readText(raw.outputFormat);
    body.constraintsText = readText(raw.constraintsText);
    body.sampleIo = raw.sampleIo;
    body.testCases = raw.testCases;
    body.timeLimitMs = readNumber(raw.timeLimitMs, "execution time limit", localErrors, { fallback: undefined });
  } else {
    body.blankAnswers = raw.blankAnswers;
    body.caseSensitive = raw.caseSensitive === true;
  }

  try {
    validateQuestionPayload(body);
  } catch (err) {
    const messages = Array.isArray(err.details) && err.details.length ? err.details : [err.message];
    localErrors.push(...messages.map((m) => `${m}.`.replace(/\.\.$/, ".")));
  }

  if (localErrors.length) {
    localErrors.forEach((m) => errors.push(`${label}: ${m}`));
    return null;
  }

  const question = {
    roundIndex,
    type,
    text: String(body.text).trim(),
    marks: Number(marks),
    negativeMarks: Math.max(0, Number(negativeMarks) || 0),
    timeLimitSeconds: normalizeTimeLimit(timeLimitSeconds),
    options: [],
  };

  if (type === "mcq") {
    question.options = body.options.map((o) => ({ text: String(o.text).trim(), isCorrect: !!o.isCorrect }));
  } else if (type === "coding") {
    Object.assign(question, {
      language: body.language,
      allowedLanguages: normalizeLanguages(body.allowedLanguages, body.language),
      starterCode: body.starterCode || null,
      expectedOutput: body.expectedOutput || null,
      referenceSolution: body.referenceSolution || null,
      problemStatement: body.problemStatement || null,
      inputFormat: body.inputFormat || null,
      outputFormat: body.outputFormat || null,
      constraintsText: body.constraintsText || null,
      sampleIo: normalizeSampleIo(body.sampleIo),
      testCases: normalizeTestCases(body.testCases),
      timeLimitMs: clampTimeLimit(body.timeLimitMs),
    });
  } else {
    Object.assign(question, {
      blankAnswers: normalizeBlankAnswers(body.blankAnswers),
      caseSensitive: !!body.caseSensitive,
    });
  }
  return question;
}

// Does this coding question use anything that only exists on databases that
// ran migration_programming_judge.sql (hidden tests, samples, statement, ...)?
function usesJudgeColumns(q) {
  if (q.type !== "coding") return false;
  return !!(
    q.testCases.length ||
    q.sampleIo.length ||
    q.problemStatement ||
    q.inputFormat ||
    q.outputFormat ||
    q.constraintsText ||
    q.timeLimitMs !== 3000 ||
    q.allowedLanguages.length > 1
  );
}

/**
 * Validates and normalises an untrusted transfer document (the JSON that was
 * embedded in an exported PDF). Returns everything the controller needs, or
 * throws a 400 ApiError listing every problem found (with question numbers).
 */
function normalizeImportDocument(raw) {
  if (!isObject(raw) || ![FORMAT_ID, LEGACY_FORMAT_ID].includes(raw.format)) {
    throw bad(
      "This PDF doesn't contain Eduverse quiz data. Only PDFs created with “Export PDF” in this portal can be imported."
    );
  }
  if (!Number.isInteger(raw.version) || raw.version < 1) {
    throw bad("This PDF's quiz data has an unrecognised version.");
  }
  if (raw.version > FORMAT_VERSION) {
    throw bad(
      "This PDF was exported from a newer version of the portal than this server understands. Update the portal, then import it again."
    );
  }

  const errors = [];
  const quizBlock = normalizeQuizBlock(raw.quiz, errors);
  const rounds = normalizeRounds(raw.rounds, errors);

  let questions = [];
  if (raw.questions !== undefined && raw.questions !== null && !Array.isArray(raw.questions)) {
    errors.push("The questions list is not valid.");
  } else if (Array.isArray(raw.questions)) {
    if (raw.questions.length > LIMITS.questions) {
      errors.push(`A quiz can have at most ${LIMITS.questions} questions.`);
    } else {
      questions = raw.questions
        .map((q, i) => normalizeQuestion(q, i, rounds.length, errors))
        .filter(Boolean);
    }
  }

  if (errors.length) {
    const shown = errors.slice(0, LIMITS.maxReportedProblems);
    if (errors.length > shown.length) shown.push(`…and ${errors.length - shown.length} more problem(s).`);
    throw bad(
      `This PDF's quiz data can't be imported (${errors.length} problem${errors.length === 1 ? "" : "s"} found). Fix them in the original quiz, export it again, and retry.`,
      shown
    );
  }

  const optionCount = questions.reduce((sum, q) => sum + q.options.length, 0);
  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

  // Integrity check: the counts written at export time must match what is
  // actually in the data block (catches truncated or hand-edited files).
  if (isObject(raw.stats)) {
    const declared = raw.stats;
    const mismatches = [];
    if (declared.roundCount !== undefined && declared.roundCount !== rounds.length) mismatches.push("rounds");
    if (declared.questionCount !== undefined && declared.questionCount !== questions.length) mismatches.push("questions");
    if (declared.optionCount !== undefined && declared.optionCount !== optionCount) mismatches.push("answer options");
    if (mismatches.length) {
      throw bad(
        `This PDF's quiz data looks incomplete or was modified (the number of ${mismatches.join(" / ")} doesn't match what was exported). Export the quiz again.`
      );
    }
  }

  const typeCounts = { mcq: 0, coding: 0, fill_blank: 0 };
  questions.forEach((q) => {
    typeCounts[q.type] += 1;
  });

  const warnings = [];
  const { quiz } = quizBlock;
  const now = Date.now();
  if (quiz.startTime && quiz.endTime && new Date(quiz.endTime) < new Date(quiz.startTime)) {
    warnings.push("The quiz's end time is earlier than its start time. Check the schedule in Details after importing.");
  } else if (quiz.endTime && new Date(quiz.endTime).getTime() < now) {
    warnings.push("The quiz's scheduled end time has already passed. Update the schedule in Details after importing.");
  }
  if (!questions.length) warnings.push("This quiz has no questions.");

  return {
    quiz,
    password: quizBlock.password,
    rounds,
    questions,
    // Database features this document depends on (checked by the controller).
    needs: {
      rounds: rounds.length > 0,
      qualification: rounds.some((r) => r.qualificationPercentage > 0),
      timeLimits: questions.some((q) => q.timeLimitSeconds),
      judge: questions.some(usesJudgeColumns),
    },
    counts: {
      rounds: rounds.length,
      questions: questions.length,
      options: optionCount,
      totalMarks,
      types: typeCounts,
    },
    warnings,
  };
}

/**
 * Builds the database rows for an import. Mirrors what `createQuiz`,
 * `createRound` and `createQuestion` write, column for column, so an imported
 * quiz is indistinguishable from one built by hand. `ids` are generated by the
 * caller so children can reference parents without relying on return order.
 */
function buildInsertRows(parsed, { quizId, passwordHash, title, status, placement, supports, newId }) {
  const { quiz } = parsed;

  const quizRow = {
    id: quizId,
    title,
    description: quiz.description || "",
    password_hash: passwordHash,
    duration_minutes: quiz.durationMinutes,
    start_time: quiz.startTime,
    end_time: quiz.endTime,
    max_marks: quiz.maxMarks,
    passing_percentage: quiz.passingPercentage,
    max_attempts: quiz.maxAttempts,
    randomize_questions: quiz.randomizeQuestions,
    randomize_options: quiz.randomizeOptions,
    auto_submit: quiz.autoSubmit,
    allow_late_join: quiz.allowLateJoin,
    show_leaderboard: quiz.showLeaderboard,
    tab_switch_limit: quiz.tabSwitchLimit,
    status,
    placement,
  };

  const roundIds = parsed.rounds.map(() => newId());
  const roundRows = parsed.rounds.map((r, i) => ({
    id: roundIds[i],
    quiz_id: quizId,
    name: r.name,
    description: r.description,
    order_index: i,
    ...(supports.qualification ? { qualification_percentage: r.qualificationPercentage } : {}),
  }));

  // order_index is numbered independently inside every round (and inside the
  // "no round" group), exactly like createQuestion does.
  const nextOrder = new Map();
  const questionRows = [];
  const optionRows = [];

  parsed.questions.forEach((q) => {
    const groupKey = supports.rounds && q.roundIndex !== null ? q.roundIndex : -1;
    const order = nextOrder.get(groupKey) || 0;
    nextOrder.set(groupKey, order + 1);

    const id = newId();
    const isCoding = q.type === "coding";
    const isBlank = q.type === "fill_blank";

    questionRows.push({
      id,
      quiz_id: quizId,
      ...(supports.rounds ? { round_id: q.roundIndex !== null ? roundIds[q.roundIndex] : null } : {}),
      ...(supports.timeLimits ? { time_limit_seconds: q.timeLimitSeconds } : {}),
      question_text: q.text,
      marks: q.marks,
      negative_marks: q.negativeMarks,
      order_index: order,
      question_type: q.type,
      language: isCoding ? q.language : null,
      starter_code: isCoding ? q.starterCode : null,
      expected_output: isCoding ? q.expectedOutput : null,
      reference_solution: isCoding ? q.referenceSolution : null,
      ...(supports.judge
        ? {
            problem_statement: isCoding ? q.problemStatement : null,
            input_format: isCoding ? q.inputFormat : null,
            output_format: isCoding ? q.outputFormat : null,
            constraints_text: isCoding ? q.constraintsText : null,
            sample_io: isCoding ? q.sampleIo : [],
            test_cases: isCoding ? q.testCases : [],
            time_limit_ms: isCoding ? q.timeLimitMs : 3000,
            allowed_languages: isCoding ? q.allowedLanguages : [],
          }
        : {}),
      blank_answers: isBlank ? q.blankAnswers : null,
      case_sensitive: isBlank ? q.caseSensitive : false,
    });

    q.options.forEach((o, idx) => {
      optionRows.push({ question_id: id, option_text: o.text, is_correct: o.isCorrect, order_index: idx });
    });
  });

  return { quizRow, roundRows, questionRows, optionRows };
}

module.exports = {
  FORMAT_ID,
  FORMAT_VERSION,
  QUIZ_STATUSES,
  BCRYPT_HASH_RE,
  buildExportDocument,
  normalizeImportDocument,
  buildInsertRows,
};
