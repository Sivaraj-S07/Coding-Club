const test = require("node:test");
const assert = require("node:assert/strict");
const { FakeDb } = require("./helpers/fakeSupabase");
const { loadFresh } = require("./helpers/load");
const { seedRichQuiz } = require("./helpers/seed");

async function richBundle() {
  const db = new FakeDb();
  const seeded = await seedRichQuiz(db);
  const { transfer } = loadFresh(db);
  const quiz = db.rows.quizzes[0];
  const questions = db.rows.questions.map((q) => ({
    ...q,
    quiz_options: db.rows.quiz_options.filter((o) => o.question_id === q.id),
  }));
  return { transfer, seeded, bundle: { quiz, rounds: db.rows.rounds, questions } };
}

// Deep copy through JSON — exactly what happens to the document when it is
// written into a PDF and read back.
const viaJson = (v) => JSON.parse(JSON.stringify(v));

test("export lists rounds and questions in the order the builder shows them", async () => {
  const { transfer, bundle } = await richBundle();
  const doc = transfer.buildExportDocument(bundle);

  assert.equal(doc.format, "eduverse-quiz");
  assert.equal(doc.version, 1);
  assert.deepEqual(doc.rounds.map((r) => r.name), ["Round 1 — Aptitude", "Round 2 — Coding"]);
  // Round 1 (by order), then Round 2, then the unassigned question last.
  assert.deepEqual(
    doc.questions.map((q) => q.text),
    ["What is 2 + 2?", "Second MCQ", "The capital of France is ___ and its country is ___.", "Write a function that adds two numbers.", "Unassigned question"]
  );
  assert.deepEqual(doc.questions.map((q) => q.roundIndex), [0, 0, 0, 1, null]);
  assert.deepEqual(doc.questions[0].options.map((o) => o.text), ["3", "4", "5", "22"]);
  assert.deepEqual(doc.questions[0].options.map((o) => o.isCorrect), [false, true, false, false]);
  assert.deepEqual(doc.stats, { roundCount: 2, questionCount: 5, optionCount: 8, totalMarks: 17 });
});

test("export carries every quiz setting and timing value", async () => {
  const { transfer, bundle } = await richBundle();
  const { quiz } = transfer.buildExportDocument(bundle);
  assert.equal(quiz.title, "Full Stack Sprint — “Round-Robin” ✓ தமிழ்");
  assert.equal(quiz.description, "Line one\nLine two with <b>html</b> & symbols");
  assert.equal(quiz.durationMinutes, 45);
  assert.equal(quiz.startTime, "2030-01-15T09:30:00+00:00");
  assert.equal(quiz.endTime, "2030-01-15T12:00:00+00:00");
  assert.equal(quiz.maxMarks, 33);
  assert.equal(quiz.passingPercentage, 55.5);
  assert.equal(quiz.maxAttempts, 2);
  assert.equal(quiz.tabSwitchLimit, 5);
  assert.equal(quiz.randomizeQuestions, false);
  assert.equal(quiz.randomizeOptions, true);
  assert.equal(quiz.autoSubmit, false);
  assert.equal(quiz.allowLateJoin, true);
  assert.equal(quiz.showLeaderboard, false);
  assert.equal(quiz.status, "live");
  assert.equal(quiz.placement, "quizzes");
});

test("export includes the readable password only when it was verified, else the hash", async () => {
  const { transfer, bundle } = await richBundle();

  const hashed = transfer.buildExportDocument(bundle);
  assert.equal(hashed.quiz.password, null);
  assert.match(hashed.quiz.passwordHash, transfer.BCRYPT_HASH_RE);

  const plain = transfer.buildExportDocument(bundle, { plainPassword: "abc" });
  assert.equal(plain.quiz.password, "abc");
  assert.equal(plain.quiz.passwordHash, null, "the hash is not duplicated alongside the readable password");
});

test("export → JSON → import restores every field (round-trip is lossless)", async () => {
  const { transfer, bundle } = await richBundle();
  const doc = viaJson(transfer.buildExportDocument(bundle, { plainPassword: "pw" }));
  const parsed = transfer.normalizeImportDocument(doc);

  assert.equal(parsed.password.plain, "pw");
  assert.equal(parsed.quiz.durationMinutes, 45);
  assert.equal(parsed.quiz.startTime, new Date("2030-01-15T09:30:00Z").toISOString());
  assert.equal(parsed.rounds[0].qualificationPercentage, 62.5);
  assert.equal(parsed.rounds[0].description, "Warm-up round");
  assert.equal(parsed.rounds[1].description, null);

  const [mcq, , blank, coding, loose] = parsed.questions;
  assert.equal(mcq.negativeMarks, 0.5);
  assert.equal(mcq.timeLimitSeconds, 60);
  assert.deepEqual(blank.blankAnswers, [["paris"], ["france", "french republic"]]);
  assert.equal(blank.caseSensitive, true);

  // Code is restored byte for byte — tabs and indentation included.
  assert.equal(coding.starterCode, "def add(a, b):\n\t# TODO\n    return None\n");
  assert.equal(coding.referenceSolution, "def add(a, b):\n    return a + b\n");
  assert.deepEqual(coding.allowedLanguages, ["python", "cpp"]);
  assert.equal(coding.timeLimitMs, 5000);
  assert.equal(coding.timeLimitSeconds, 900);
  assert.equal(coding.testCases.length, 2);
  assert.equal(coding.testCases[1].hidden, true);
  assert.deepEqual(coding.sampleIo, [{ input: "3 4", output: "7", explanation: "3 + 4" }]);
  assert.equal(coding.constraintsText, "1 <= a, b <= 10^9");

  assert.equal(loose.roundIndex, null);
  assert.deepEqual(parsed.counts, { rounds: 2, questions: 5, options: 8, totalMarks: 17, types: { mcq: 3, coding: 1, fill_blank: 1 } });
  assert.deepEqual(parsed.needs, { rounds: true, qualification: true, timeLimits: true, judge: true });
});

test("re-exporting an imported document gives the same document", async () => {
  const { transfer, bundle } = await richBundle();
  const first = viaJson(transfer.buildExportDocument(bundle, { plainPassword: "pw" }));
  const parsed = transfer.normalizeImportDocument(first);

  // Materialise the parsed quiz as DB rows and export it again.
  const { FakeDb } = require("./helpers/fakeSupabase");
  const db = new FakeDb();
  let n = 0;
  const rows = transfer.buildInsertRows(parsed, {
    quizId: "22222222-2222-4222-8222-222222222222",
    passwordHash: "x",
    title: parsed.quiz.title,
    status: parsed.quiz.status,
    placement: "quizzes",
    supports: { rounds: true, qualification: true, timeLimits: true, judge: true },
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  });
  db.rows.quizzes.push(rows.quizRow);
  db.rows.rounds.push(...rows.roundRows);
  db.rows.questions.push(...rows.questionRows);
  db.rows.quiz_options.push(...rows.optionRows);
  const questions = db.rows.questions.map((q) => ({ ...q, quiz_options: db.rows.quiz_options.filter((o) => o.question_id === q.id) }));
  const second = viaJson(
    transfer.buildExportDocument({ quiz: { ...db.rows.quizzes[0], password_hash: first.quiz.passwordHash }, rounds: db.rows.rounds, questions }, { plainPassword: "pw" })
  );

  // Timestamps are re-normalised to UTC ISO; everything else must be identical.
  first.exportedAt = second.exportedAt = "-";
  first.quiz.startTime = new Date(first.quiz.startTime).toISOString();
  first.quiz.endTime = new Date(first.quiz.endTime).toISOString();
  assert.deepEqual(second, first);
});

test("order_index is numbered separately inside each round, in document order", async () => {
  const { transfer, bundle } = await richBundle();
  const parsed = transfer.normalizeImportDocument(viaJson(transfer.buildExportDocument(bundle)));
  let n = 0;
  const { questionRows, roundRows } = transfer.buildInsertRows(parsed, {
    quizId: "q", passwordHash: "h", title: "t", status: "draft", placement: "quizzes",
    supports: { rounds: true, qualification: true, timeLimits: true, judge: true },
    newId: () => `id-${++n}`,
  });
  const byRound = {};
  questionRows.forEach((q) => {
    (byRound[q.round_id ?? "none"] ||= []).push(q.order_index);
  });
  assert.deepEqual(byRound[roundRows[0].id], [0, 1, 2]);
  assert.deepEqual(byRound[roundRows[1].id], [0]);
  assert.deepEqual(byRound.none, [0]);
});

test("only columns the database has are written on an older schema", async () => {
  const { transfer } = await richBundle();
  const doc = {
    format: "eduverse-quiz", version: 1,
    quiz: { title: "Plain", password: "x" },
    rounds: [],
    questions: [{ type: "mcq", text: "Q", marks: 1, options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }] }],
  };
  const parsed = transfer.normalizeImportDocument(doc);
  assert.deepEqual(parsed.needs, { rounds: false, qualification: false, timeLimits: false, judge: false });
  const { questionRows } = transfer.buildInsertRows(parsed, {
    quizId: "q", passwordHash: "h", title: "Plain", status: "draft", placement: "quizzes",
    supports: { rounds: false, qualification: false, timeLimits: false, judge: false },
    newId: () => "id",
  });
  for (const col of ["round_id", "time_limit_seconds", "problem_statement", "test_cases", "sample_io", "time_limit_ms", "allowed_languages"]) {
    assert.ok(!(col in questionRows[0]), `${col} must not be written when the column is unsupported`);
  }
});

test("missing optional quiz fields fall back to the same defaults as Create Quiz", async () => {
  const { transfer } = await richBundle();
  const parsed = transfer.normalizeImportDocument({ format: "eduverse-quiz", version: 1, quiz: { title: "  Only a title  " } });
  assert.deepEqual(parsed.quiz, {
    title: "Only a title", description: "", durationMinutes: 30, startTime: null, endTime: null, maxMarks: 0,
    passingPercentage: 40, maxAttempts: 1, tabSwitchLimit: 3, randomizeQuestions: true, randomizeOptions: true,
    autoSubmit: true, allowLateJoin: false, showLeaderboard: true, status: "draft",
  });
  assert.deepEqual(parsed.password, { plain: null, hash: null });
});

test("option and question text are trimmed like the builder does", async () => {
  const { transfer } = await richBundle();
  const parsed = transfer.normalizeImportDocument({
    format: "eduverse-quiz", version: 1, quiz: { title: "T" },
    questions: [{ type: "mcq", text: "  Q?  ", options: [{ text: "  a ", isCorrect: true }, { text: "b" }] }],
  });
  assert.equal(parsed.questions[0].text, "Q?");
  assert.deepEqual(parsed.questions[0].options.map((o) => o.text), ["a", "b"]);
});

// ---- rejection paths ------------------------------------------------------

function problemsOf(transfer, doc) {
  try {
    transfer.normalizeImportDocument(doc);
  } catch (err) {
    return { status: err.statusCode, message: err.message, details: err.details || [] };
  }
  assert.fail("expected the document to be rejected");
}

test("rejects anything that is not a Eduverse quiz document", async () => {
  const { transfer } = await richBundle();
  for (const junk of [null, undefined, 5, "text", [], {}, { format: "other", version: 1 }]) {
    const p = problemsOf(transfer, junk);
    assert.equal(p.status, 400);
    assert.match(p.message, /doesn't contain Eduverse quiz data/);
  }
});

test("rejects unknown or newer document versions with a clear message", async () => {
  const { transfer } = await richBundle();
  assert.match(problemsOf(transfer, { format: "eduverse-quiz", version: 99, quiz: { title: "x" } }).message, /newer version/);
  assert.match(problemsOf(transfer, { format: "eduverse-quiz", version: "1", quiz: { title: "x" } }).message, /unrecognised version/);
  assert.match(problemsOf(transfer, { format: "eduverse-quiz", version: 0, quiz: { title: "x" } }).message, /unrecognised version/);
});

test("reports every problem with the question number that caused it", async () => {
  const { transfer } = await richBundle();
  const p = problemsOf(transfer, {
    format: "eduverse-quiz", version: 1,
    quiz: { title: "", durationMinutes: 0, passingPercentage: 140, status: "bogus", startTime: "not a date" },
    rounds: [{ name: "" }],
    questions: [
      { type: "mcq", text: "no correct", options: [{ text: "a" }, { text: "b" }] },
      { type: "mcq", text: "one option", options: [{ text: "a", isCorrect: true }] },
      { type: "mcq", text: "bad round", roundIndex: 7, options: [{ text: "a", isCorrect: true }, { text: "b" }] },
      { type: "coding", text: "bad lang", language: "cobol", testCases: [{ input: "1", expectedOutput: "1" }] },
      { type: "fill_blank", text: "empty blank", blankAnswers: [[]] },
      { type: "mcq", text: "neg > marks", marks: 1, negativeMarks: 2, options: [{ text: "a", isCorrect: true }, { text: "b" }] },
      { type: "essay", text: "unknown type" },
      "not even an object",
    ],
  });
  assert.equal(p.status, 400);
  const joined = p.details.join("\n");
  assert.match(joined, /quiz name is missing/);
  assert.match(joined, /Duration must be greater than 0/);
  assert.match(joined, /Passing percentage cannot be more than 100/);
  assert.match(joined, /Quiz status must be one of/);
  assert.match(joined, /Start time is not a valid date/);
  assert.match(joined, /Round 1: the round name is missing/);
  assert.match(joined, /Question 1: exactly one option must be marked correct/);
  assert.match(joined, /Question 2: at least 2 options are required/);
  assert.match(joined, /Question 3: it points to a round that does not exist/);
  assert.match(joined, /Question 4: language must be one of c, cpp, java, python/);
  assert.match(joined, /Question 5: blank 1 needs at least one accepted answer/);
  assert.match(joined, /Question 6: negativeMarks cannot be greater than marks/);
  assert.match(joined, /Question 7: unknown question type "essay"/);
  assert.match(joined, /Question 8 is not valid/);
});

test("detects a truncated or edited data block through the export counts", async () => {
  const { transfer, bundle } = await richBundle();
  const doc = viaJson(transfer.buildExportDocument(bundle));
  doc.questions.pop();
  assert.match(problemsOf(transfer, doc).message, /incomplete or was modified/);

  const doc2 = viaJson(transfer.buildExportDocument(bundle));
  doc2.questions[0].options.pop();
  assert.match(problemsOf(transfer, doc2).message, /answer options/);
});

test("enforces size ceilings so a hostile file cannot flood the database", async () => {
  const { transfer } = await richBundle();
  const many = { format: "eduverse-quiz", version: 1, quiz: { title: "x" }, rounds: Array.from({ length: 201 }, () => ({ name: "r" })) };
  assert.match(problemsOf(transfer, many).details.join(" "), /at most 200 rounds/);
  const tooManyQs = { format: "eduverse-quiz", version: 1, quiz: { title: "x" }, questions: new Array(2001).fill({}) };
  assert.match(problemsOf(transfer, tooManyQs).details.join(" "), /at most 2000 questions/);
});

test("rejects a bcrypt hash that is not a valid bcrypt hash", async () => {
  const { transfer } = await richBundle();
  const parsed = transfer.normalizeImportDocument({
    format: "eduverse-quiz", version: 1, quiz: { title: "x", passwordHash: "definitely-not-a-hash" },
  });
  assert.deepEqual(parsed.password, { plain: null, hash: null });
});

test("warns (but still imports) when the schedule has already passed", async () => {
  const { transfer } = await richBundle();
  const parsed = transfer.normalizeImportDocument({
    format: "eduverse-quiz", version: 1, quiz: { title: "x", startTime: "2001-01-01T00:00:00Z", endTime: "2001-01-02T00:00:00Z" },
  });
  assert.ok(parsed.warnings.some((w) => /already passed/.test(w)));
});
