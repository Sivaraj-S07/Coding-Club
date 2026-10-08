const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { FakeDb } = require("./helpers/fakeSupabase");
const { loadFresh, call } = require("./helpers/load");
const { seedRichQuiz, QUIZ_PASSWORD } = require("./helpers/seed");

const viaJson = (v) => JSON.parse(JSON.stringify(v));

async function setup(dbOptions) {
  const db = new FakeDb(dbOptions);
  const seeded = await seedRichQuiz(db);
  const { pdf, transfer } = loadFresh(db);
  return { db, seeded, pdf, transfer };
}

async function exportDoc(pdf, quizId, password) {
  const res = await call(pdf.exportQuiz, { params: { id: quizId }, body: password === undefined ? {} : { password } });
  return viaJson(res.body.document);
}

// What Postgres fills in for columns a row doesn't mention (see schema.sql).
// Only applied to keys that are missing, so it can never hide a real difference.
const QUESTION_DEFAULTS = {
  language: null, starter_code: null, expected_output: null, reference_solution: null,
  blank_answers: null, case_sensitive: false, time_limit_seconds: null, problem_statement: null,
  input_format: null, output_format: null, constraints_text: null, sample_io: [], test_cases: [],
  time_limit_ms: 3000, allowed_languages: [], negative_marks: 0,
};
const withDefaults = (row) => ({ ...QUESTION_DEFAULTS, ...row });

// Rows of one quiz with volatile fields (ids / timestamps) removed, so two
// quizzes can be compared for "same content".
function contentOf(db, quizId) {
  const quiz = db.rows.quizzes.find((q) => q.id === quizId);
  const rounds = db.rows.rounds.filter((r) => r.quiz_id === quizId).sort((a, b) => a.order_index - b.order_index);
  const roundName = new Map(rounds.map((r) => [r.id, r.name]));
  const questions = db.rows.questions
    .filter((q) => q.quiz_id === quizId)
    .map((q) => ({
      ...withDefaults(q),
      round_id: q.round_id ? roundName.get(q.round_id) : null,
      options: db.rows.quiz_options
        .filter((o) => o.question_id === q.id)
        .sort((a, b) => a.order_index - b.order_index)
        .map((o) => [o.option_text, o.is_correct, o.order_index]),
    }))
    .map(({ id, quiz_id, created_at, updated_at, ...rest }) => rest)
    .sort((a, b) => `${a.round_id}|${a.order_index}`.localeCompare(`${b.round_id}|${b.order_index}`));
  const { id, created_at, updated_at, password_hash, start_time, end_time, ...quizRest } = quiz;
  return {
    quiz: { ...quizRest, start_time: new Date(start_time).toISOString(), end_time: new Date(end_time).toISOString() },
    rounds: rounds.map(({ id: _i, quiz_id, created_at: _c, updated_at: _u, ...rest }) => rest),
    questions,
  };
}

// ---- export ---------------------------------------------------------------

test("export without a password carries the hash, never a readable password", async () => {
  const { pdf, seeded, db } = await setup();
  const res = await call(pdf.exportQuiz, { params: { id: seeded.quizId }, body: {} });
  assert.equal(res.status, 200);
  assert.equal(res.body.passwordIncluded, false);
  assert.equal(res.body.document.quiz.password, null);
  assert.equal(res.body.document.quiz.passwordHash, db.rows.quizzes[0].password_hash);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("export with the correct password prints it; a wrong password is refused", async () => {
  const { pdf, seeded } = await setup();
  const ok = await call(pdf.exportQuiz, { params: { id: seeded.quizId }, body: { password: QUIZ_PASSWORD } });
  assert.equal(ok.body.passwordIncluded, true);
  assert.equal(ok.body.document.quiz.password, QUIZ_PASSWORD);
  assert.equal(ok.body.document.quiz.passwordHash, null);

  await assert.rejects(
    call(pdf.exportQuiz, { params: { id: seeded.quizId }, body: { password: "wrong" } }),
    (err) => err.statusCode === 400 && /isn't this quiz's password/.test(err.message)
  );
  await assert.rejects(
    call(pdf.exportQuiz, { params: { id: seeded.quizId }, body: { password: 12345 } }),
    (err) => err.statusCode === 400
  );
});

test("export of a missing / malformed quiz id is a clean 404 / 400", async () => {
  const { pdf } = await setup();
  await assert.rejects(call(pdf.exportQuiz, { params: { id: "99999999-9999-4999-8999-999999999999" } }), (e) => e.statusCode === 404);
  await assert.rejects(call(pdf.exportQuiz, { params: { id: "nope" } }), (e) => e.statusCode === 400);
});

// ---- import: the round-trip ------------------------------------------------

test("FULL ROUND TRIP: export → import creates an identical quiz with the same password", async () => {
  const { pdf, seeded, db } = await setup();
  const doc = await exportDoc(pdf, seeded.quizId, QUIZ_PASSWORD);

  const res = await call(pdf.importQuiz, { body: { document: doc, placement: "quizzes", status: "keep" } });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.imported, { rounds: 2, questions: 5, options: 8 });

  const newId = res.body.quiz.id;
  assert.notEqual(newId, seeded.quizId);
  assert.deepEqual(contentOf(db, newId), contentOf(db, seeded.quizId));

  // The password works for students exactly as before.
  const created = db.rows.quizzes.find((q) => q.id === newId);
  assert.equal(await bcrypt.compare(QUIZ_PASSWORD, created.password_hash), true);
  assert.equal(await bcrypt.compare("wrong", created.password_hash), false);

  // The original quiz is untouched.
  assert.equal(db.rows.quizzes.filter((q) => q.id === seeded.quizId).length, 1);
  assert.equal(db.rows.questions.filter((q) => q.quiz_id === seeded.quizId).length, 5);
});

test("round trip without the printed password restores the SAME password through the hash", async () => {
  const { pdf, seeded, db } = await setup();
  const doc = await exportDoc(pdf, seeded.quizId); // no password typed at export
  assert.equal(doc.quiz.password, null);

  const res = await call(pdf.importQuiz, { body: { document: doc, placement: "quizzes" } });
  const created = db.rows.quizzes.find((q) => q.id === res.body.quiz.id);
  assert.equal(created.password_hash, db.rows.quizzes[0].password_hash);
  assert.equal(await bcrypt.compare(QUIZ_PASSWORD, created.password_hash), true);
});

test("a fresh salt is used when the readable password is re-hashed", async () => {
  const { pdf, seeded, db } = await setup();
  const doc = await exportDoc(pdf, seeded.quizId, QUIZ_PASSWORD);
  const res = await call(pdf.importQuiz, { body: { document: doc } });
  const created = db.rows.quizzes.find((q) => q.id === res.body.quiz.id);
  assert.notEqual(created.password_hash, db.rows.quizzes[0].password_hash);
  assert.equal(await bcrypt.compare(QUIZ_PASSWORD, created.password_hash), true);
});

test("imports into Demo Quizzes (placement=landing) and back into Quizzes", async () => {
  const { pdf, seeded, db } = await setup();
  const doc = await exportDoc(pdf, seeded.quizId, QUIZ_PASSWORD);
  const landing = await call(pdf.importQuiz, { body: { document: doc, placement: "landing" } });
  assert.equal(db.rows.quizzes.find((q) => q.id === landing.body.quiz.id).placement, "landing");
  assert.equal(landing.body.quiz.placement, "landing");
  const plain = await call(pdf.importQuiz, { body: { document: doc, placement: "quizzes" } });
  assert.equal(db.rows.quizzes.find((q) => q.id === plain.body.quiz.id).placement, "quizzes");
});

test("status: defaults to draft (safe), or restores the exported status when asked", async () => {
  const { pdf, seeded, db } = await setup();
  const doc = await exportDoc(pdf, seeded.quizId, QUIZ_PASSWORD);
  assert.equal(doc.quiz.status, "live");

  const safe = await call(pdf.importQuiz, { body: { document: doc } });
  assert.equal(db.rows.quizzes.find((q) => q.id === safe.body.quiz.id).status, "draft");
  const kept = await call(pdf.importQuiz, { body: { document: doc, status: "keep" } });
  assert.equal(db.rows.quizzes.find((q) => q.id === kept.body.quiz.id).status, "live");
  await assert.rejects(call(pdf.importQuiz, { body: { document: doc, status: "live" } }), (e) => e.statusCode === 400);
});

test("title and password can be overridden at import time", async () => {
  const { pdf, seeded, db } = await setup();
  const doc = await exportDoc(pdf, seeded.quizId, QUIZ_PASSWORD);
  const res = await call(pdf.importQuiz, { body: { document: doc, title: "  Renamed  ", password: "new-pass" } });
  const created = db.rows.quizzes.find((q) => q.id === res.body.quiz.id);
  assert.equal(created.title, "Renamed");
  assert.equal(await bcrypt.compare("new-pass", created.password_hash), true);
  assert.equal(await bcrypt.compare(QUIZ_PASSWORD, created.password_hash), false);
  await assert.rejects(call(pdf.importQuiz, { body: { document: doc, title: "   " } }), (e) => e.statusCode === 400);
});

// ---- import: dry run, password, validation --------------------------------

test("dryRun validates and previews without writing anything", async () => {
  const { pdf, seeded, db } = await setup();
  const doc = await exportDoc(pdf, seeded.quizId);
  const before = db.snapshot();
  const res = await call(pdf.importQuiz, { body: { document: doc, dryRun: true, placement: "landing" } });
  assert.equal(res.body.dryRun, true);
  assert.equal(db.snapshot(), before, "dry run must not change the database");
  assert.equal(res.body.summary.passwordSource, "hash");
  assert.equal(res.body.summary.roundCount, 2);
  assert.equal(res.body.summary.questionCount, 5);
  assert.equal(res.body.summary.optionCount, 8);
  assert.equal(res.body.summary.exportedStatus, "live");
  assert.equal(res.body.summary.status, "draft");
  assert.deepEqual(res.body.summary.questionTypes, { mcq: 3, coding: 1, fill_blank: 1 });
});

test("a PDF with no usable password needs one to be supplied", async () => {
  const { pdf, seeded, db } = await setup();
  const doc = await exportDoc(pdf, seeded.quizId);
  doc.quiz.passwordHash = null;
  const before = db.snapshot();

  const preview = await call(pdf.importQuiz, { body: { document: doc, dryRun: true } });
  assert.equal(preview.body.summary.passwordSource, "none");

  await assert.rejects(call(pdf.importQuiz, { body: { document: doc } }), (e) => e.statusCode === 400 && /needs one/.test(e.message));
  assert.equal(db.snapshot(), before, "a refused import writes nothing");

  const ok = await call(pdf.importQuiz, { body: { document: doc, password: "typed-by-admin" } });
  const created = db.rows.quizzes.find((q) => q.id === ok.body.quiz.id);
  assert.equal(await bcrypt.compare("typed-by-admin", created.password_hash), true);
});

test("an invalid document is refused with a list of problems and writes nothing", async () => {
  const { pdf, seeded, db } = await setup();
  const doc = await exportDoc(pdf, seeded.quizId, QUIZ_PASSWORD);
  doc.questions[0].options.forEach((o) => (o.isCorrect = false));
  doc.stats.optionCount = 8;
  const before = db.snapshot();
  await assert.rejects(call(pdf.importQuiz, { body: { document: doc } }), (e) => {
    assert.equal(e.statusCode, 400);
    assert.match(e.details.join("\n"), /Question 1: exactly one option must be marked correct/);
    return true;
  });
  assert.equal(db.snapshot(), before);
});

test("bad request bodies are 400s, not crashes", async () => {
  const { pdf } = await setup();
  for (const body of [undefined, {}, { document: null }, { document: "str" }, { document: {} }]) {
    await assert.rejects(call(pdf.importQuiz, { body }), (e) => e.statusCode === 400);
  }
  await assert.rejects(call(pdf.importQuiz, { body: { document: {}, placement: "elsewhere" } }), (e) => e.statusCode === 400);
});

// ---- older databases ------------------------------------------------------

test("a quiz needing rounds is refused (with the migration to run) on a database without them", async () => {
  const { pdf, seeded } = await setup();
  const doc = await exportDoc(pdf, seeded.quizId, QUIZ_PASSWORD);

  const old = new FakeDb({ missingTables: ["rounds"], missingColumns: { questions: ["round_id"] } });
  const { pdf: oldPdf } = loadFresh(old);
  const before = old.snapshot();
  await assert.rejects(call(oldPdf.importQuiz, { body: { document: doc } }), (e) => {
    assert.equal(e.statusCode, 409);
    assert.match(e.details.join("\n"), /Rounds: run backend\/sql\/schema\.sql/);
    return true;
  });
  assert.equal(old.snapshot(), before, "nothing is half-imported");
});

test("a simple quiz still imports on an older database that lacks optional columns", async () => {
  const old = new FakeDb({
    missingTables: ["rounds"],
    missingColumns: {
      quizzes: ["placement"],
      questions: ["round_id", "time_limit_seconds", "problem_statement", "input_format", "output_format", "constraints_text", "sample_io", "test_cases", "time_limit_ms", "allowed_languages"],
    },
  });
  const { pdf } = loadFresh(old);
  const doc = {
    format: "eduverse-quiz", version: 1,
    quiz: { title: "Old DB quiz", password: "pw" },
    questions: [
      { type: "mcq", text: "Q1", options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }] },
      { type: "fill_blank", text: "___", blankAnswers: [["x"]] },
    ],
  };
  const res = await call(pdf.importQuiz, { body: { document: doc, placement: "quizzes" } });
  assert.equal(res.status, 201);
  assert.equal(old.rows.questions.length, 2);

  // Demo Quizzes need the placement column: refused up front, nothing written.
  const before = old.snapshot();
  await assert.rejects(call(pdf.importQuiz, { body: { document: doc, placement: "landing" } }), (e) => /migration_landing_quizzes/.test(e.message));
  assert.equal(old.snapshot(), before);
});

test("hidden test cases are refused (not silently dropped) without the judge migration", async () => {
  const { pdf, seeded } = await setup();
  const doc = await exportDoc(pdf, seeded.quizId, QUIZ_PASSWORD);
  doc.rounds = [];
  doc.questions.forEach((q) => (q.roundIndex = null));
  doc.stats.roundCount = 0;
  doc.questions.forEach((q) => (q.timeLimitSeconds = null));

  const old = new FakeDb({ missingColumns: { questions: ["problem_statement", "input_format", "output_format", "constraints_text", "sample_io", "test_cases", "time_limit_ms", "allowed_languages"] } });
  const { pdf: oldPdf } = loadFresh(old);
  await assert.rejects(call(oldPdf.importQuiz, { body: { document: doc } }), (e) => e.statusCode === 409 && /migration_programming_judge/.test(e.details.join()));
});

// ---- failure handling -----------------------------------------------------

for (const failing of ["quizzes", "rounds", "questions", "quiz_options"]) {
  test(`a database failure while inserting ${failing} rolls everything back`, async () => {
    const { pdf, seeded, db } = await setup();
    const doc = await exportDoc(pdf, seeded.quizId, QUIZ_PASSWORD);
    const before = db.snapshot();
    db.failNext(failing, "insert");
    await assert.rejects(call(pdf.importQuiz, { body: { document: doc } }), (e) => e.statusCode === 500 && /Failed to import/.test(e.message));
    assert.equal(db.snapshot(), before, "no partial quiz may remain");
  });
}

test("large quizzes are inserted in chunks and still come out complete", async () => {
  const { pdf } = await setup();
  const db = new FakeDb();
  const { pdf: bigPdf } = loadFresh(db);
  const questions = Array.from({ length: 130 }, (_, i) => ({
    type: "mcq", text: `Question ${i + 1}`, marks: 1,
    options: [{ text: "a", isCorrect: i % 2 === 0 }, { text: "b", isCorrect: i % 2 === 1 }, { text: "c" }],
  }));
  const res = await call(bigPdf.importQuiz, { body: { document: { format: "eduverse-quiz", version: 1, quiz: { title: "Big", password: "p" }, questions } } });
  assert.deepEqual(res.body.imported, { rounds: 0, questions: 130, options: 390 });
  assert.equal(db.rows.questions.length, 130);
  assert.deepEqual(db.rows.questions.map((q) => q.order_index), Array.from({ length: 130 }, (_, i) => i));
  void pdf;
});
