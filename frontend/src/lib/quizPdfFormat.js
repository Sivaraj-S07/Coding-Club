// ----------------------------------------------------------------------------
// Shared constants for "Export quiz as PDF" / "Import Quiz from PDF".
//
// An exported PDF has two layers:
//   1. The pages people read (details, rounds, questions, answers).
//   2. The complete quiz as a small JSON document embedded in the PDF as a
//      standard file attachment (`ATTACHMENT_NAME`). This is what Import reads,
//      so nothing (code indentation, hidden test cases, exact answers, ...) is
//      ever lost to text-extraction guesswork.
//
// The backend (backend/src/utils/quizTransfer.js) owns the document's
// structure and validation; these values must stay in sync with it.
// ----------------------------------------------------------------------------

export const FORMAT_ID = "eduverse-quiz";
export const LEGACY_FORMAT_ID = "coding-club-quiz"; // Read-only compatibility with existing exports.
export const FORMAT_VERSION = 1;
export const ATTACHMENT_NAME = "eduverse-quiz.json";
export const ATTACHMENT_DESCRIPTION =
  "Eduverse quiz data used by Import Quiz from PDF. Do not edit or remove.";

// Guard rails for what the Import dialog will even try to read.
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_DATA_BYTES = 12 * 1024 * 1024;

/** Error with a machine-readable `code`, so the UI can show a precise message. */
export class QuizPdfError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "QuizPdfError";
    this.code = code;
  }
}

/** "Quiz name" -> "quiz-name" (safe file name, never empty). */
export function slugify(text, fallback = "quiz") {
  const slug = String(text ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return slug || fallback;
}

export function pdfFileNameFor(title) {
  return `quiz-${slugify(title)}.pdf`;
}
