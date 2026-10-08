import test from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildQuizPdf } from "../src/lib/quizPdfExport.js";
import { readQuizFromPdf } from "../src/lib/quizPdfImport.js";
import { QuizPdfError, pdfFileNameFor, slugify } from "../src/lib/quizPdfFormat.js";

// A quiz document shaped like the backend's export (see quizTransfer.js).
function sampleDocument(overrides = {}) {
  return {
    format: "eduverse-quiz",
    version: 1,
    exportedAt: "2030-01-01T00:00:00.000Z",
    quiz: {
      title: "Full Stack Sprint — “Round-Robin” ✓ தமிழ் 😀",
      description: "Line one\nLine two with <b>html</b> & (parens) \\ backslash",
      password: null,
      passwordHash: "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234",
      durationMinutes: 45,
      startTime: "2030-01-15T09:30:00.000Z",
      endTime: "2030-01-15T12:00:00.000Z",
      maxMarks: 33,
      passingPercentage: 55.5,
      maxAttempts: 2,
      tabSwitchLimit: 5,
      randomizeQuestions: false,
      randomizeOptions: true,
      autoSubmit: false,
      allowLateJoin: true,
      showLeaderboard: false,
      status: "live",
      placement: "landing",
    },
    rounds: [
      { name: "Round 1 — Aptitude", description: "Warm-up", qualificationPercentage: 62.5 },
      { name: "Round 2", description: "", qualificationPercentage: 0 },
    ],
    questions: [
      {
        roundIndex: 0, type: "mcq", text: "What is 2 + 2?", marks: 2, negativeMarks: 0.5, timeLimitSeconds: 60,
        options: [{ text: "3", isCorrect: false }, { text: "4", isCorrect: true }, { text: "5 ✓ தமிழ்", isCorrect: false }],
      },
      { roundIndex: 0, type: "fill_blank", text: "___ and ___", marks: 3, negativeMarks: 0, timeLimitSeconds: null, blankAnswers: [["paris"], ["france", "french republic"]], caseSensitive: true },
      {
        roundIndex: 1, type: "coding", text: "Add two numbers", marks: 10, negativeMarks: 2, timeLimitSeconds: 900,
        language: "python", allowedLanguages: ["python", "cpp"], problemStatement: "Print the sum.", inputFormat: "Two ints", outputFormat: "One int",
        constraintsText: "1 <= a <= 10^9", sampleIo: [{ input: "3 4", output: "7", explanation: "3 + 4" }],
        testCases: [{ name: "Basic", input: "3 4", expectedOutput: "7", hidden: false }, { name: "Big", input: "1\n2\n", expectedOutput: "3", hidden: true }],
        timeLimitMs: 5000,
        starterCode: "def add(a, b):\n\t# tab here\n    return None\n\n\n# trailing spaces   \n",
        expectedOutput: "7", referenceSolution: "def add(a, b):\n    return a + b\n",
      },
      { roundIndex: null, type: "mcq", text: "Loose question", marks: 1, negativeMarks: 0, timeLimitSeconds: null, options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }] },
    ],
    stats: { roundCount: 2, questionCount: 4, optionCount: 5, totalMarks: 16 },
    ...overrides,
  };
}

const readBack = (bytes) => readQuizFromPdf(bytes, { pdfjs });

async function pageText(bytes) {
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 });
  const pdf = await task.promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += `${content.items.map((it) => it.str).join(" ")}\n`;
  }
  await task.destroy();
  return text;
}

test("the quiz read back from the PDF is exactly the exported document", async () => {
  const doc = sampleDocument();
  const { bytes, pageCount } = buildQuizPdf(doc);
  const result = await readBack(bytes);
  assert.deepEqual(result.document, doc);
  assert.equal(result.pageCount, pageCount);
});

test("code indentation, tabs, blank lines, unicode and emoji survive byte for byte", async () => {
  const doc = sampleDocument();
  const { document } = await readBack(buildQuizPdf(doc).bytes);
  assert.equal(document.questions[2].starterCode, doc.questions[2].starterCode);
  assert.equal(document.questions[2].testCases[1].input, "1\n2\n");
  assert.equal(document.quiz.title, doc.quiz.title);
  assert.equal(document.quiz.description, doc.quiz.description);
  assert.equal(document.questions[0].options[2].text, "5 ✓ தமிழ்");
});

test("the readable pages show the password only when it was included", async () => {
  const hashed = await pageText(buildQuizPdf(sampleDocument()).bytes);
  assert.match(hashed, /Protected/);
  assert.doesNotMatch(hashed, /\$2a\$10\$/, "the bcrypt hash must not be printed on the pages");

  const plainDoc = sampleDocument();
  plainDoc.quiz.password = "Secret#123 with spaces";
  plainDoc.quiz.passwordHash = null;
  const plain = await pageText(buildQuizPdf(plainDoc).bytes);
  assert.match(plain, /Secret#123 with spaces/);
});

test("the readable pages contain the quiz content", async () => {
  const text = await pageText(buildQuizPdf(sampleDocument()).bytes);
  for (const expected of ["Round 1", "62.5% to qualify", "What is 2 + 2?", "CORRECT", "45 minutes", "Add two numbers", "Starter code".toUpperCase(), "Test case 2".toUpperCase(), "(hidden)".toUpperCase()]) {
    assert.ok(text.toUpperCase().includes(expected.toUpperCase()), `expected the pages to mention "${expected}"`);
  }
});

test("non-Latin text shows as ? on the pages, with a note, but is intact in the data", async () => {
  const built = buildQuizPdf(sampleDocument());
  assert.ok(built.lossyCharacters > 0);
  assert.match(await pageText(built.bytes), /About some characters/);
  const plainAscii = sampleDocument();
  plainAscii.quiz.title = "Plain title";
  plainAscii.questions[0].options[2].text = "five";
  plainAscii.rounds[0].name = "Round 1";
  assert.equal(buildQuizPdf(plainAscii).lossyCharacters, 0);
});

test("a quiz with no rounds and no questions still exports and reads back", async () => {
  const doc = sampleDocument({ rounds: [], questions: [], stats: { roundCount: 0, questionCount: 0, optionCount: 0, totalMarks: 0 } });
  const built = buildQuizPdf(doc);
  assert.deepEqual((await readBack(built.bytes)).document, doc);
  assert.match(await pageText(built.bytes), /no questions yet/);
});

test("hostile layout input does not break the PDF (long words, huge lines, odd characters)", async () => {
  const doc = sampleDocument();
  doc.quiz.title = "T".repeat(400);
  doc.questions[0].text = `${"W".repeat(3000)}\n\n\n${"x ".repeat(2000)}`;
  doc.questions[0].options = Array.from({ length: 30 }, (_, i) => ({ text: `opt ${i} ${"z".repeat(500)}`, isCorrect: i === 3 }));
  doc.questions[2].starterCode = `${"a".repeat(5000)}\n${"\t".repeat(50)}x\n\u0000\u0007ctrl`;
  doc.questions[1].blankAnswers = [["(unbalanced", "back\\slash", ")"]];
  doc.stats.optionCount = 33;
  const built = buildQuizPdf(doc);
  assert.deepEqual((await readBack(built.bytes)).document, doc);
});

test("a large quiz (400 questions) exports, reads back and stays reasonably small", async () => {
  const questions = Array.from({ length: 400 }, (_, i) => ({
    roundIndex: i % 2, type: "mcq", text: `Question ${i + 1}: ${"lorem ipsum ".repeat(20)}`, marks: 1, negativeMarks: 0, timeLimitSeconds: null,
    options: [0, 1, 2, 3].map((k) => ({ text: `Option ${k} ${"dolor ".repeat(8)}`, isCorrect: k === i % 4 })),
  }));
  const doc = sampleDocument({ questions, stats: { roundCount: 2, questionCount: 400, optionCount: 1600, totalMarks: 400 } });
  const started = Date.now();
  const built = buildQuizPdf(doc);
  const result = await readBack(built.bytes);
  assert.deepEqual(result.document, doc);
  assert.ok(built.pageCount > 20);
  assert.ok(built.bytes.length < 2_000_000, `PDF is ${built.bytes.length} bytes`);
  assert.ok(Date.now() - started < 15_000, "should be fast enough to run in a click");
});

test("file names are safe and never empty", () => {
  assert.equal(pdfFileNameFor("My Quiz: Round #1!"), "quiz-my-quiz-round-1.pdf");
  assert.equal(pdfFileNameFor("தமிழ்"), "quiz-quiz.pdf");
  assert.equal(pdfFileNameFor(""), "quiz-quiz.pdf");
  assert.equal(slugify("Café Déjà Vu"), "cafe-deja-vu");
  assert.ok(pdfFileNameFor("x".repeat(500)).length < 80);
});

test("export refuses data that isn't a quiz document", () => {
  for (const junk of [null, undefined, {}, { format: "nope", quiz: {} }, { format: "eduverse-quiz" }]) {
    assert.throws(() => buildQuizPdf(junk), (e) => e instanceof QuizPdfError && e.code === "bad-document");
  }
});

// ---- reading files that are NOT valid quiz exports ---------------------------

async function rejects(input, code, pattern) {
  await assert.rejects(readBack(input), (e) => {
    assert.ok(e instanceof QuizPdfError, `expected QuizPdfError, got ${e?.name}: ${e?.message}`);
    assert.equal(e.code, code);
    if (pattern) assert.match(e.message, pattern);
    return true;
  });
}

test("rejects empty files, non-PDFs and damaged PDFs with a clear message", async () => {
  await rejects(new Uint8Array(0), "empty");
  await rejects(new TextEncoder().encode("hello, I am a text file"), "not-pdf");
  const good = buildQuizPdf(sampleDocument()).bytes;
  await rejects(good.slice(0, 700), "not-pdf");
  const mangled = good.slice();
  mangled.fill(0x41, 200, mangled.length - 200);
  await assert.rejects(readBack(mangled), (e) => e instanceof QuizPdfError);
});

test("a normal PDF without quiz data explains that only exported PDFs work", async () => {
  const doc = new jsPDF();
  doc.text("Just an ordinary PDF", 20, 20);
  await rejects(new Uint8Array(doc.output("arraybuffer")), "no-data", /Only PDFs created with/);
});

// Builds a PDF carrying an arbitrary attachment (same mechanism as the exporter).
function pdfWithAttachment(name, payloadBytes) {
  const doc = new jsPDF();
  doc.text("carrier", 20, 20);
  let binary = "";
  for (const b of payloadBytes) binary += String.fromCharCode(b);
  let specId = 0;
  doc.internal.events.subscribe("putResources", () => {
    const streamId = doc.internal.newObject();
    doc.internal.write(`<< /Type /EmbeddedFile /Length ${binary.length} >>`);
    doc.internal.write("stream");
    doc.internal.write(binary);
    doc.internal.write("endstream");
    doc.internal.write("endobj");
    specId = doc.internal.newObject();
    doc.internal.write(`<< /Type /Filespec /F (${name}) /UF (${name}) /EF << /F ${streamId} 0 R >> >>`);
    doc.internal.write("endobj");
  });
  doc.internal.events.subscribe("putCatalog", () => {
    doc.internal.write(`/Names << /EmbeddedFiles << /Names [(${name}) ${specId} 0 R] >> >>`);
  });
  return new Uint8Array(doc.output("arraybuffer"));
}
const utf8 = (v) => new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v));

test("attachments that are not a quiz export are rejected", async () => {
  await rejects(pdfWithAttachment("eduverse-quiz.json", utf8({ format: "something-else" })), "no-data");
  await rejects(pdfWithAttachment("eduverse-quiz.json", utf8("{ this is not json")), "no-data");
  await rejects(pdfWithAttachment("eduverse-quiz.json", new Uint8Array([0xff, 0xfe, 0x00, 0x80])), "no-data");
  await rejects(pdfWithAttachment("notes.txt", utf8(sampleDocument())), "no-data");
});

test("a valid quiz attachment is found even if a tool renamed the file", async () => {
  const doc = sampleDocument();
  const { document } = await readBack(pdfWithAttachment("renamed-by-viewer.json", utf8(doc)));
  assert.deepEqual(document, doc);
});

test("a password-protected PDF gets a specific message", async () => {
  const doc = new jsPDF({ encryption: { userPassword: "user", ownerPassword: "owner", userPermissions: ["print"] } });
  doc.text("secret", 20, 20);
  await rejects(new Uint8Array(doc.output("arraybuffer")), "encrypted", /password-protected/);
});

test("reads File/Blob-like inputs as well as raw bytes", async () => {
  const doc = sampleDocument();
  const { bytes } = buildQuizPdf(doc);
  const blobLike = { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  assert.deepEqual((await readBack(blobLike)).document, doc);
  assert.deepEqual((await readBack(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))).document, doc);
});

test("reading does not consume the caller's bytes (can be read twice)", async () => {
  const { bytes } = buildQuizPdf(sampleDocument());
  await readBack(bytes);
  assert.ok(bytes.length > 0);
  await readBack(bytes);
});
