/**
 * Code validation adapter for programming/coding questions.
 *
 * IMPORTANT — this module does NOT execute student-submitted code.
 * Running arbitrary C/C++/Java/Python source on the server requires a
 * properly sandboxed execution service (e.g. Judge0, Piston, or a
 * containerized worker with strict CPU/memory/time/network limits). Building
 * that safely is out of scope here, and never appropriate to bolt on
 * casually — unsandboxed code execution is a critical security risk.
 *
 * Instead, this module defines the adapter interface the rest of the app
 * calls (`evaluateSubmission`). Today it grades heuristically and safely,
 * with no execution at all. To add real compilation/execution later, swap
 * the body of `evaluateSubmission` for a call to your judge service of
 * choice (e.g. POST the code + language to Judge0, compare its stdout to
 * `expectedOutput`) — every call site in this codebase stays the same.
 */

function normalize(str) {
  return String(str || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .replace(/[ \t]+/g, " ")
    .toLowerCase();
}

function tokenize(str) {
  return normalize(str)
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);
}

// Rough token-overlap similarity (Jaccard-ish) between two code/text blobs.
// Used only for partial credit, never for a hard pass/fail decision.
function similarity(a, b) {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap += 1;
  return overlap / Math.max(ta.size, tb.size);
}

/**
 * @param {object} params
 * @param {string} params.submittedCode - the student's submitted source code
 * @param {string|null} params.expectedOutput - admin-provided expected output, if any
 * @param {string|null} params.referenceSolution - admin-provided model solution, if any
 * @returns {{ outcome: 'correct'|'partial'|'wrong'|'unanswered', ratio: number }}
 *   ratio is the fraction of full marks to award (0..1).
 */
function evaluateSubmission({ submittedCode, expectedOutput, referenceSolution }) {
  if (!submittedCode || !String(submittedCode).trim()) {
    return { outcome: "unanswered", ratio: 0 };
  }

  const target = expectedOutput || referenceSolution;
  if (!target) {
    // Nothing to validate against — can't safely auto-grade this submission.
    // Leave it visible to the admin (via the stored code_answer) for manual review.
    return { outcome: "wrong", ratio: 0 };
  }

  if (normalize(submittedCode) === normalize(target)) {
    return { outcome: "correct", ratio: 1 };
  }

  const ratio = similarity(submittedCode, target);
  if (ratio >= 0.85) return { outcome: "correct", ratio: 1 };
  if (ratio >= 0.3) return { outcome: "partial", ratio };
  return { outcome: "wrong", ratio: 0 };
}

/**
 * Grades a fill-in-the-blank submission against the admin-defined answer key.
 * @param {object} params
 * @param {string[]} params.submittedBlanks - the student's answer for each blank, in order
 * @param {string[][]} params.blankAnswers - accepted answers per blank, in order (from the admin)
 * @param {boolean} params.caseSensitive
 * @returns {{ outcome: 'correct'|'partial'|'wrong'|'unanswered', ratio: number }}
 */
function evaluateFillBlank({ submittedBlanks, blankAnswers, caseSensitive }) {
  const blanks = Array.isArray(blankAnswers) ? blankAnswers : [];
  if (!blanks.length) return { outcome: "wrong", ratio: 0 };

  const submitted = Array.isArray(submittedBlanks) ? submittedBlanks : [];
  const hasAnyAnswer = submitted.some((b) => String(b || "").trim());
  if (!hasAnyAnswer) return { outcome: "unanswered", ratio: 0 };

  const norm = (s) => {
    const trimmed = String(s || "").trim().replace(/\s+/g, " ");
    return caseSensitive ? trimmed : trimmed.toLowerCase();
  };

  let correctBlanks = 0;
  blanks.forEach((accepted, i) => {
    const given = norm(submitted[i]);
    if (!given) return;
    const acceptedNorm = (accepted || []).map(norm);
    if (acceptedNorm.includes(given)) correctBlanks += 1;
  });

  const ratio = correctBlanks / blanks.length;
  if (ratio === 1) return { outcome: "correct", ratio: 1 };
  if (ratio > 0) return { outcome: "partial", ratio };
  return { outcome: "wrong", ratio: 0 };
}

module.exports = { evaluateSubmission, evaluateFillBlank };
