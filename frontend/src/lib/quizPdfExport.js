import { jsPDF } from "jspdf";
import { zlibSync } from "fflate";
import {
  ATTACHMENT_DESCRIPTION,
  ATTACHMENT_NAME,
  FORMAT_ID,
  QuizPdfError,
  pdfFileNameFor,
} from "./quizPdfFormat.js";

// ----------------------------------------------------------------------------
// Builds the "Export quiz as PDF" file from the transfer document returned by
// POST /api/admin/quizzes/:id/export.
//
//   * The PAGES are for people: quiz details, rounds, every question with its
//     options / correct answers / marks / timers, coding problems with code
//     blocks and test cases.
//   * The complete document is ALSO embedded (compressed) as a standard PDF
//     file attachment. Import reads that, so the restored quiz is exact.
//
// Nothing here touches the DOM, so it also runs in Node (used by the tests).
// ----------------------------------------------------------------------------

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 42;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - 56;
const TOP_CONTINUED = 46;

const C = {
  navy: [17, 24, 39],
  blue: [37, 99, 235],
  blueSoft: [232, 240, 254],
  blueLine: [191, 210, 245],
  text: [31, 41, 55],
  muted: [107, 114, 128],
  line: [221, 226, 234],
  zebra: [246, 248, 251],
  green: [21, 128, 61],
  greenSoft: [226, 246, 234],
  amber: [161, 98, 7],
  amberSoft: [255, 246, 224],
  amberLine: [240, 214, 150],
  code: [243, 245, 249],
  white: [255, 255, 255],
};

const TYPE_LABEL = { mcq: "Multiple choice", coding: "Programming", fill_blank: "Fill in the blank" };
const LANGUAGE_LABEL = { c: "C", cpp: "C++", java: "Java", python: "Python" };
const STATUS_LABEL = { draft: "Draft", upcoming: "Upcoming", live: "Live", completed: "Completed" };

// ---- text safety -----------------------------------------------------------
// The PDF's built-in fonts only draw Latin-1. Typographic punctuation is mapped
// to plain equivalents; anything else (e.g. other scripts, emoji) shows as "?".
// That affects ONLY the readable pages — the embedded data keeps every
// character exactly, and Import restores it.
const TYPOGRAPHY = {
  "\u2018": "'", "\u2019": "'", "\u201A": ",", "\u201C": '"', "\u201D": '"', "\u201E": '"',
  "\u2013": "-", "\u2014": "-", "\u2212": "-", "\u2026": "...", "\u2192": "->", "\u2190": "<-",
  "\u21D2": "=>", "\u2264": "<=", "\u2265": ">=", "\u2260": "!=", "\u2022": "*", "\u00A0": " ",
  "\u200B": "", "\u200C": "", "\u200D": "", "\uFEFF": "",
};

function createSanitizer() {
  let lossy = 0;
  const safe = (value, { code = false } = {}) => {
    const text = String(value ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, code ? "    " : " ");
    let out = "";
    let inLossyRun = false;
    for (const ch of text) {
      if (ch === "\n") {
        out += ch;
        inLossyRun = false;
        continue;
      }
      const mapped = TYPOGRAPHY[ch];
      if (mapped !== undefined) {
        out += mapped;
        continue;
      }
      const cp = ch.codePointAt(0);
      if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa1 && cp <= 0xff)) {
        out += ch;
        inLossyRun = false;
      } else if (cp < 0x20 || (cp >= 0x7f && cp <= 0xa0)) {
        // control characters: dropped
      } else if (!inLossyRun) {
        // A whole run of unsupported characters becomes a single "?".
        out += "?";
        lossy += 1;
        inLossyRun = true;
      }
    }
    return out;
  };
  return { safe, lossyCount: () => lossy };
}

// ---- small formatters ------------------------------------------------------
const fmtNum = (n) => String(Number(Number(n).toFixed(2)));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function fmtSeconds(total) {
  const s = Math.round(Number(total));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} min ${rest} s` : `${m} min`;
}

function fmtDate(iso) {
  if (!iso) return "Not set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  try {
    return d.toLocaleString("en-GB", {
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
      hour12: false, timeZoneName: "short",
    });
  } catch {
    return d.toISOString();
  }
}

const yesNo = (v) => (v ? "Yes" : "No");

function toBinaryString(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return out;
}

// ---- embedding the quiz data ----------------------------------------------
// jsPDF has no attachment API, so this uses its plugin hooks: while resources
// are written it adds an EmbeddedFile stream + Filespec, and the catalog gets a
// /Names /EmbeddedFiles entry pointing at it (what any PDF viewer, PDF.js and
// tools like `pdfdetach` read as a file attachment).
function embedQuizData(doc, jsonBytes) {
  const compressed = toBinaryString(zlibSync(jsonBytes, { level: 9 }));
  let fileSpecId = 0;
  const { events, newObject, write } = doc.internal;

  events.subscribe("putResources", () => {
    const streamId = newObject();
    write(
      `<< /Type /EmbeddedFile /Subtype /application#2Fjson /Filter /FlateDecode /Length ${compressed.length} /Params << /Size ${jsonBytes.length} >> >>`
    );
    write("stream");
    write(compressed);
    write("endstream");
    write("endobj");

    fileSpecId = newObject();
    write(
      `<< /Type /Filespec /F (${ATTACHMENT_NAME}) /UF (${ATTACHMENT_NAME}) /Desc (${ATTACHMENT_DESCRIPTION}) /AFRelationship /Data /EF << /F ${streamId} 0 R /UF ${streamId} 0 R >> >>`
    );
    write("endobj");
  });

  events.subscribe("putCatalog", () => {
    write(`/Names << /EmbeddedFiles << /Names [(${ATTACHMENT_NAME}) ${fileSpecId} 0 R] >> >>`);
  });
}

// ---- the readable pages ----------------------------------------------------
function renderPages(doc, data, S, exportedAt) {
  const { safe } = S;
  const quiz = data.quiz;
  const rounds = Array.isArray(data.rounds) ? data.rounds : [];
  const questions = Array.isArray(data.questions) ? data.questions : [];
  const title = safe(quiz.title) || "Untitled quiz";

  let y = 0;

  const setText = (font, style, size, color) => {
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };
  const fill = (color) => doc.setFillColor(color[0], color[1], color[2]);
  const stroke = (color) => doc.setDrawColor(color[0], color[1], color[2]);

  const newPage = () => {
    doc.addPage();
    y = TOP_CONTINUED;
  };
  // Starts a new page when `h` doesn't fit. Returns true if it did.
  const ensure = (h) => {
    if (y + h > BOTTOM) {
      newPage();
      return true;
    }
    return false;
  };

  const baseline = (top, lineH, size) => top + lineH / 2 + size * 0.34;

  function writeLines(lines, { x = MARGIN, font = "helvetica", style = "normal", size = 10, color = C.text, lineH } = {}) {
    const step = lineH || size * 1.42;
    setText(font, style, size, color);
    for (const line of lines) {
      if (ensure(step)) setText(font, style, size, color);
      if (line) doc.text(line, x, baseline(y, step, size));
      y += step;
    }
  }

  function wrap(text, width, { font = "helvetica", style = "normal", size = 10 } = {}) {
    setText(font, style, size, C.text);
    const out = [];
    safe(text)
      .split("\n")
      .forEach((para) => {
        if (para.trim() === "") out.push("");
        else out.push(...doc.splitTextToSize(para, width));
      });
    return out;
  }

  function paragraph(text, opts = {}) {
    const { x = MARGIN, width = CONTENT_W - (opts.x ? opts.x - MARGIN : 0) } = opts;
    writeLines(wrap(text, width, opts), { ...opts, x });
  }

  function fit(text, maxWidth) {
    if (doc.getTextWidth(text) <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && doc.getTextWidth(`${t}...`) > maxWidth) t = t.slice(0, -1);
    return `${t}...`;
  }

  // `keepWith` reserves room for the content that follows so a heading is never
  // left stranded at the bottom of a page.
  function sectionTitle(text, keepWith = 0) {
    ensure(46 + keepWith);
    y += 10;
    setText("helvetica", "bold", 12.5, C.navy);
    doc.text(text, MARGIN, y + 12);
    stroke(C.blue);
    doc.setLineWidth(1.6);
    doc.line(MARGIN, y + 19, MARGIN + 30, y + 19);
    y += 30;
  }

  function noticeBox(heading, body, { bg = C.blueSoft, border = C.blueLine, headColor = C.blue } = {}) {
    const pad = 10;
    const lines = wrap(body, CONTENT_W - pad * 2, { size: 9 });
    const h = pad * 2 + 13 + lines.length * 12.4;
    ensure(h + 4);
    fill(bg);
    stroke(border);
    doc.setLineWidth(0.7);
    doc.roundedRect(MARGIN, y, CONTENT_W, h, 5, 5, "FD");
    setText("helvetica", "bold", 9.5, headColor);
    doc.text(heading, MARGIN + pad, y + pad + 8);
    setText("helvetica", "normal", 9, C.text);
    lines.forEach((line, i) => {
      if (line) doc.text(line, MARGIN + pad, y + pad + 22 + i * 12.4);
    });
    y += h + 12;
  }

  function detailsGrid(rows) {
    const labelW = 140;
    const valueX = MARGIN + labelW + 10;
    const valueW = CONTENT_W - labelW - 20;
    rows.forEach(([label, value, opts = {}], i) => {
      const font = opts.mono ? "courier" : "helvetica";
      const style = opts.bold ? "bold" : "normal";
      const lines = wrap(value === "" || value == null ? "-" : value, valueW, { font, style, size: 9.5 });
      const h = Math.max(22, lines.length * 13 + 9);
      ensure(h);
      if (i % 2 === 0) {
        fill(C.zebra);
        doc.rect(MARGIN, y, CONTENT_W, h, "F");
      }
      setText("helvetica", "bold", 8, C.muted);
      doc.text(label.toUpperCase(), MARGIN + 10, y + 14);
      setText(font, style, 9.5, C.text);
      lines.forEach((line, li) => {
        if (line) doc.text(line, valueX, y + 14 + li * 13);
      });
      y += h;
    });
    stroke(C.line);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 8;
  }

  function field(label, text, x = MARGIN + 12) {
    if (text === null || text === undefined || String(text).trim() === "") return;
    ensure(34);
    setText("helvetica", "bold", 7.8, C.muted);
    doc.text(label.toUpperCase(), x, y + 8);
    y += 12;
    paragraph(text, { x, size: 9.5 });
    y += 3;
  }

  function codeBlock(label, text, x = MARGIN + 12) {
    const width = PAGE_W - MARGIN - x;
    if (label) {
      ensure(48);
      setText("helvetica", "bold", 7.8, C.muted);
      doc.text(label.toUpperCase(), x, y + 8);
      y += 12;
    }
    const size = 8.5;
    const lineH = 11.6;
    const pad = 6;
    const perLine = Math.max(12, Math.floor((width - pad * 2) / (size * 0.6)));
    const lines = [];
    safe(text, { code: true })
      .replace(/\n+$/, "")
      .split("\n")
      .forEach((line) => {
        if (line === "") lines.push("");
        else for (let i = 0; i < line.length; i += perLine) lines.push(line.slice(i, i + perLine));
      });
    if (!lines.length || (lines.length === 1 && lines[0] === "")) lines.splice(0, lines.length, "(empty)");

    const band = (h) => {
      fill(C.code);
      doc.rect(x, y, width, h + 0.5, "F");
    };
    ensure(pad + lineH * 2);
    band(pad);
    y += pad;
    lines.forEach((line) => {
      ensure(lineH);
      band(lineH);
      if (line) {
        setText("courier", "normal", size, C.text);
        doc.text(line, x + pad, baseline(y, lineH, size));
      }
      y += lineH;
    });
    ensure(pad);
    band(pad);
    y += pad + 5;
  }

  // ---- cover ----
  const titleLines = wrap(title, CONTENT_W, { style: "bold", size: 19 }).slice(0, 2);
  const bandH = 66 + titleLines.length * 25;
  fill(C.navy);
  doc.rect(0, 0, PAGE_W, bandH, "F");
  setText("helvetica", "bold", 8.5, [147, 197, 253]);
  doc.text("EDUVERSE  |  QUIZ EXPORT", MARGIN, 30);
  setText("helvetica", "normal", 8.5, [203, 213, 225]);
  doc.text(`Exported ${fmtDate(exportedAt)}`, PAGE_W - MARGIN, 30, { align: "right" });
  setText("helvetica", "bold", 19, C.white);
  titleLines.forEach((line, i) => doc.text(line, MARGIN, 60 + i * 25));
  y = bandH + 18;

  noticeBox(
    "How to restore this quiz",
    "In the Admin Portal open Quizzes (or Demo Quizzes), choose \"Import Quiz from PDF\" and select this file. " +
      "The complete quiz is stored inside this PDF, so keep the file as exported: printing it to a new PDF or " +
      "re-saving it through another tool removes the stored data."
  );

  // ---- details ----
  sectionTitle("Quiz details");
  const hasPlain = typeof quiz.password === "string" && quiz.password !== "";
  const passwordRow = hasPlain
    ? ["Password", quiz.password, { mono: true, bold: true }]
    : [
        "Password",
        quiz.passwordHash
          ? "Protected - not printed. The quiz's existing password travels inside this file, so importing restores the very same password."
          : "Not included.",
      ];
  detailsGrid([
    ["Quiz name", quiz.title, { bold: true }],
    ["Description", quiz.description || "-"],
    passwordRow,
    ["Listed under", quiz.placement === "landing" ? "Demo Quizzes (landing page)" : "Quizzes"],
    ["Status", STATUS_LABEL[quiz.status] || quiz.status],
    ["Duration", `${quiz.durationMinutes} minutes`],
    ["Starts", fmtDate(quiz.startTime)],
    ["Ends", fmtDate(quiz.endTime)],
    ["Maximum marks", fmtNum(quiz.maxMarks)],
    ["Passing percentage", `${fmtNum(quiz.passingPercentage)}%`],
    ["Attempts allowed", String(quiz.maxAttempts)],
    ["Tab switch limit", String(quiz.tabSwitchLimit)],
    ["Randomize questions", yesNo(quiz.randomizeQuestions)],
    ["Randomize options", yesNo(quiz.randomizeOptions)],
    ["Auto submit at time up", yesNo(quiz.autoSubmit)],
    ["Allow late join", yesNo(quiz.allowLateJoin)],
    ["Show leaderboard", yesNo(quiz.showLeaderboard)],
  ]);

  // ---- summary ----
  const counts = { mcq: 0, coding: 0, fill_blank: 0 };
  let optionCount = 0;
  let totalMarks = 0;
  questions.forEach((q) => {
    if (counts[q.type] !== undefined) counts[q.type] += 1;
    optionCount += Array.isArray(q.options) ? q.options.length : 0;
    totalMarks += Number(q.marks) || 0;
  });

  sectionTitle("Contents", 70);
  const cards = [
    ["Rounds", String(rounds.length)],
    ["Questions", String(questions.length)],
    ["Answer options", String(optionCount)],
    ["Total marks", fmtNum(totalMarks)],
  ];
  const gap = 10;
  const cardW = (CONTENT_W - gap * 3) / 4;
  cards.forEach(([label, value], i) => {
    const x = MARGIN + i * (cardW + gap);
    fill(C.zebra);
    stroke(C.line);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, y, cardW, 46, 5, 5, "FD");
    setText("helvetica", "bold", 15, C.navy);
    doc.text(value, x + 12, y + 22);
    setText("helvetica", "normal", 8.5, C.muted);
    doc.text(label, x + 12, y + 36);
  });
  y += 58;
  paragraph(
    `${plural(counts.mcq, "multiple choice question")}, ${plural(counts.coding, "programming question")}, ${plural(counts.fill_blank, "fill-in-the-blank question")}.`,
    { size: 9.5, color: C.muted }
  );

  // ---- rounds and questions ----
  let number = 0;

  function questionBlock(q) {
    number += 1;
    const type = TYPE_LABEL[q.type] ? q.type : "mcq";
    ensure(84);
    y += 6;

    // Header row: number, type and the marks / timer summary.
    setText("helvetica", "bold", 11.5, C.blue);
    const numLabel = `Q${number}`;
    doc.text(numLabel, MARGIN, y + 12);
    const numW = doc.getTextWidth(numLabel);
    setText("helvetica", "bold", 8, C.muted);
    doc.text(TYPE_LABEL[type].toUpperCase(), MARGIN + numW + 8, y + 12);

    const meta = [`${fmtNum(q.marks)} ${Number(q.marks) === 1 ? "mark" : "marks"}`];
    if (Number(q.negativeMarks) > 0) meta.push(`-${fmtNum(q.negativeMarks)} for wrong`);
    if (q.timeLimitSeconds) meta.push(`${fmtSeconds(q.timeLimitSeconds)} timer`);
    setText("helvetica", "normal", 8.5, C.muted);
    doc.text(meta.join("  |  "), PAGE_W - MARGIN, y + 12, { align: "right" });
    y += 20;

    paragraph(q.text || "(no question text)", { style: "bold", size: 10.5 });
    y += 3;

    if (type === "mcq") {
      const options = Array.isArray(q.options) ? q.options : [];
      options.forEach((opt, i) => {
        const letter = i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
        const x = MARGIN + 12;
        const textX = x + 24;
        const width = CONTENT_W - 12 - 24 - (opt.isCorrect ? 62 : 6);
        const lines = wrap(opt.text || "(empty option)", width, { size: 9.8, style: opt.isCorrect ? "bold" : "normal" });
        const h = lines.length * 13.4 + 7;
        ensure(h);
        if (opt.isCorrect) {
          fill(C.greenSoft);
          doc.roundedRect(x - 4, y, CONTENT_W - 8, h - 1, 3, 3, "F");
        }
        setText("helvetica", "bold", 9.8, opt.isCorrect ? C.green : C.muted);
        doc.text(`${letter}.`, x + 4, y + 13);
        setText("helvetica", opt.isCorrect ? "bold" : "normal", 9.8, opt.isCorrect ? C.green : C.text);
        lines.forEach((line, li) => {
          if (line) doc.text(line, textX, y + 13 + li * 13.4);
        });
        if (opt.isCorrect) {
          setText("helvetica", "bold", 7.8, C.green);
          doc.text("CORRECT", PAGE_W - MARGIN - 8, y + 12.5, { align: "right" });
        }
        y += h;
      });
    } else if (type === "fill_blank") {
      const blanks = Array.isArray(q.blankAnswers) ? q.blankAnswers : [];
      blanks.forEach((answers, i) => {
        const list = (Array.isArray(answers) ? answers : []).join("  /  ");
        field(`Blank ${i + 1} - accepted answers`, list || "-");
      });
      field("Matching", q.caseSensitive ? "Case sensitive" : "Not case sensitive");
    } else {
      const allowed = (Array.isArray(q.allowedLanguages) ? q.allowedLanguages : []).map((l) => LANGUAGE_LABEL[l] || l);
      field("Language", LANGUAGE_LABEL[q.language] || q.language || "-");
      if (allowed.length > 1) field("Languages students may use", allowed.join(", "));
      field("Problem statement", q.problemStatement);
      field("Input format", q.inputFormat);
      field("Output format", q.outputFormat);
      field("Constraints", q.constraintsText);
      field("Execution time limit", q.timeLimitMs ? `${q.timeLimitMs} ms per test` : null);
      (Array.isArray(q.sampleIo) ? q.sampleIo : []).forEach((s, i) => {
        codeBlock(`Sample ${i + 1} - input`, s.input ?? "");
        codeBlock(`Sample ${i + 1} - output`, s.output ?? "");
        field(`Sample ${i + 1} - explanation`, s.explanation);
      });
      if (q.starterCode) codeBlock("Starter code", q.starterCode);
      if (q.referenceSolution) codeBlock("Reference solution", q.referenceSolution);
      if (q.expectedOutput) codeBlock("Expected output", q.expectedOutput);
      (Array.isArray(q.testCases) ? q.testCases : []).forEach((t, i) => {
        const name = t.name ? ` - ${t.name}` : "";
        const kind = t.hidden === false ? "visible" : "hidden";
        codeBlock(`Test case ${i + 1}${name} (${kind}) - input`, t.input ?? "");
        codeBlock(`Test case ${i + 1} - expected output`, t.expectedOutput ?? "");
      });
    }

    y += 4;
    stroke(C.line);
    doc.setLineWidth(0.5);
    ensure(4);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 4;
  }

  function roundHeader(round, index, group) {
    ensure(72);
    y += 10;
    const desc = round.description ? wrap(round.description, CONTENT_W - 28, { style: "italic", size: 9 }) : [];
    const h = 34 + desc.length * 12;
    fill(C.blueSoft);
    stroke(C.blueLine);
    doc.setLineWidth(0.7);
    doc.roundedRect(MARGIN, y, CONTENT_W, h, 5, 5, "FD");
    fill(C.blue);
    doc.rect(MARGIN, y, 4, h, "F");
    setText("helvetica", "bold", 7.8, C.blue);
    doc.text(`ROUND ${index + 1}`, MARGIN + 14, y + 13);
    setText("helvetica", "bold", 12, C.navy);
    doc.text(fit(safe(round.name), CONTENT_W - 200), MARGIN + 14, y + 28);
    const marks = group.reduce((s, q) => s + (Number(q.marks) || 0), 0);
    const info = [plural(group.length, "question"), `${fmtNum(marks)} marks`];
    if (Number(round.qualificationPercentage) > 0) info.push(`${fmtNum(round.qualificationPercentage)}% to qualify`);
    setText("helvetica", "normal", 8.5, C.muted);
    doc.text(info.join("  |  "), PAGE_W - MARGIN - 10, y + 28, { align: "right" });
    desc.forEach((line, i) => {
      setText("helvetica", "italic", 9, C.text);
      if (line) doc.text(line, MARGIN + 14, y + 44 + i * 12);
    });
    y += h + 6;
  }

  const inRound = (q, i) => q.roundIndex === i;
  const isLoose = (q) => q.roundIndex === null || q.roundIndex === undefined || !rounds[q.roundIndex];

  sectionTitle(rounds.length ? "Rounds and questions" : "Questions", 120);
  if (!questions.length) {
    paragraph("This quiz has no questions yet.", { size: 10, color: C.muted });
  }
  rounds.forEach((round, i) => {
    const group = questions.filter((q) => inRound(q, i));
    roundHeader(round, i, group);
    if (!group.length) paragraph("No questions in this round.", { size: 9.5, color: C.muted, x: MARGIN + 12 });
    group.forEach(questionBlock);
  });
  const loose = questions.filter(isLoose);
  if (loose.length) {
    if (rounds.length) {
      ensure(40);
      y += 10;
      setText("helvetica", "bold", 10.5, C.navy);
      doc.text("Questions not in any round", MARGIN, y + 11);
      y += 22;
    }
    loose.forEach(questionBlock);
  }

  if (S.lossyCount() > 0) {
    noticeBox(
      "About some characters",
      "Some characters in this quiz (for example non-Latin scripts or emoji) can't be drawn by this PDF's built-in fonts and appear as \"?\" on these pages. " +
        "They are stored exactly in the quiz data inside the file and are restored correctly when the PDF is imported.",
      { bg: C.amberSoft, border: C.amberLine, headColor: C.amber }
    );
  }

  // ---- footers ----
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    setText("helvetica", "normal", 8, C.muted);
    doc.text(fit(`Eduverse  |  Quiz export  |  ${title}`, CONTENT_W - 90), MARGIN, PAGE_H - 26);
    doc.text(`Page ${p} of ${total}`, PAGE_W - MARGIN, PAGE_H - 26, { align: "right" });
  }
}

/**
 * Builds the PDF for a quiz transfer document.
 * @returns {{ bytes: Uint8Array, fileName: string, pageCount: number, lossyCharacters: number }}
 */
export function buildQuizPdf(data, { now = new Date() } = {}) {
  if (!data || data.format !== FORMAT_ID || !data.quiz || typeof data.quiz !== "object") {
    throw new QuizPdfError("bad-document", "The server sent the quiz in an unexpected format. Please try again.");
  }

  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  // Embedded files need PDF 1.4+; jsPDF defaults to a 1.3 header.
  if (typeof doc.__private__?.setPdfVersion === "function") doc.__private__.setPdfVersion("1.7");

  const S = createSanitizer();
  renderPages(doc, data, S, now);

  doc.setProperties({
    title: `${S.safe(data.quiz.title) || "Quiz"} - Quiz export`,
    subject: "Eduverse quiz export",
    author: "Eduverse Admin Portal",
    keywords: "eduverse-quiz, quiz-export",
    creator: "Eduverse Quiz Portal",
  });

  embedQuizData(doc, new TextEncoder().encode(JSON.stringify(data)));

  const bytes = new Uint8Array(doc.output("arraybuffer"));
  return {
    bytes,
    fileName: pdfFileNameFor(data.quiz.title),
    pageCount: doc.getNumberOfPages(),
    lossyCharacters: S.lossyCount(),
  };
}

/** Browser only: saves PDF bytes as a download. */
export function downloadPdf(bytes, fileName) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
