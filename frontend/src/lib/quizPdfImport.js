import {
  ATTACHMENT_NAME,
  FORMAT_ID,
  LEGACY_FORMAT_ID,
  MAX_DATA_BYTES,
  MAX_PDF_BYTES,
  QuizPdfError,
} from "./quizPdfFormat.js";

// ----------------------------------------------------------------------------
// Reads the quiz back out of a PDF made by "Export PDF".
//
// The exported PDF carries the whole quiz as an embedded JSON attachment; this
// opens the PDF with PDF.js (a real PDF parser, so it copes with viewers that
// re-save the file) and extracts that attachment. Validation of the quiz data
// itself is done by the server, with the same rules as the quiz builder.
// ----------------------------------------------------------------------------

async function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input && typeof input.arrayBuffer === "function") return new Uint8Array(await input.arrayBuffer());
  throw new QuizPdfError("not-pdf", "That doesn't look like a PDF file.");
}

// PDF.js 6 lists attachments as a Map of metadata and loads their bytes on
// request; older versions return an object with the bytes inline. Handle both.
async function listAttachments(pdf) {
  const raw = await pdf.getAttachments();
  const entries = raw instanceof Map ? [...raw.entries()] : Object.entries(raw || {});
  return entries.map(([id, meta]) => ({
    id,
    name: String(meta?.filename ?? meta?.rawFilename ?? id),
    load: async () => {
      if (meta?.content) return meta.content;
      if (typeof pdf.getAttachmentContent === "function") return pdf.getAttachmentContent(id);
      return null;
    },
  }));
}

function parseQuizData(bytes) {
  if (!bytes || bytes.length === 0) return null;
  if (bytes.length > MAX_DATA_BYTES) {
    throw new QuizPdfError("too-large", "The quiz data in this PDF is too large to import (over 12 MB).");
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    const parsed = JSON.parse(text);
    return parsed && [FORMAT_ID, LEGACY_FORMAT_ID].includes(parsed.format) ? parsed : null;
  } catch {
    return null;
  }
}

function friendlyPdfError(err) {
  if (err instanceof QuizPdfError) return err;
  const name = err?.name || "";
  if (name === "PasswordException") {
    return new QuizPdfError("encrypted", "This PDF is password-protected. Remove the protection, then try again.");
  }
  if (name === "InvalidPDFException" || name === "FormatError" || name === "MissingPDFException") {
    return new QuizPdfError("not-pdf", "That file isn't a valid PDF, or it is damaged.");
  }
  return new QuizPdfError("read-failed", "Couldn't read this PDF. Try exporting the quiz again.");
}

/**
 * @param {File|Blob|ArrayBuffer|Uint8Array} input
 * @param {{ pdfjs?: object }} [options] `pdfjs` lets tests inject the library.
 * @returns {Promise<{ document: object, pageCount: number }>}
 */
export async function readQuizFromPdf(input, { pdfjs } = {}) {
  const bytes = await toBytes(input);
  if (bytes.length === 0) throw new QuizPdfError("empty", "That file is empty.");
  if (bytes.length > MAX_PDF_BYTES) {
    throw new QuizPdfError("too-large", "That PDF is too large (over 25 MB) to be a quiz export.");
  }
  // "%PDF-" may be preceded by a little junk in real-world files.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (!head.includes("%PDF-")) throw new QuizPdfError("not-pdf", "That file isn't a PDF.");

  let lib;
  try {
    lib = pdfjs || (await (await import("./pdfjsLoader.js")).loadPdfjs());
  } catch {
    throw new QuizPdfError("read-failed", "The PDF reader couldn't be loaded. Check your connection and try again.");
  }

  let task;
  try {
    // PDF.js takes ownership of the buffer it is given, so hand it a copy.
    task = lib.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 });
    const pdf = await task.promise;

    const attachments = await listAttachments(pdf);
    // Prefer the file we wrote; otherwise accept any JSON attachment that
    // turns out to be a quiz export (e.g. the viewer renamed it).
    attachments.sort((a, b) => Number(b.name === ATTACHMENT_NAME) - Number(a.name === ATTACHMENT_NAME));
    for (const attachment of attachments) {
      if (attachment.name !== ATTACHMENT_NAME && !/\.json$/i.test(attachment.name)) continue;
      const document = parseQuizData(await attachment.load());
      if (document) return { document, pageCount: pdf.numPages };
    }

    throw new QuizPdfError(
      "no-data",
      "This PDF doesn't contain Eduverse quiz data. Only PDFs created with \"Export PDF\" in this portal can be imported - printing to a new PDF or re-saving it with another tool removes the data."
    );
  } catch (err) {
    throw friendlyPdfError(err);
  } finally {
    try {
      await task?.destroy();
    } catch {
      /* nothing useful to do */
    }
  }
}
