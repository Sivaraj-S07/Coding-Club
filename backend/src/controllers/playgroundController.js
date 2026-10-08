/**
 * Public code playground (the "Programming" tab).
 *
 * Runs a student's own snippet with their own stdin. It NEVER touches a quiz,
 * a question, hidden test cases, marks or the database — it only forwards the
 * source to the same sandboxed judge used by Run/Submit inside a quiz.
 *
 * Security notes:
 *   - source size, stdin size and wall-clock time are all capped here
 *   - execution happens through codeRunner (local pre-installed toolchain or a
 *     remote Piston sandbox); nothing is ever installed on demand
 *   - the endpoint is rate limited in routes/playground.js
 */

const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { executeCode, SUPPORTED_LANGUAGES } = require("../utils/codeRunner");
const { discoverLanguage } = require("../utils/localRunner");
const { abortSignalForRequest } = require("../utils/requestAbort");
const { getSupabase } = require("../config/supabaseClient");

const MAX_SOURCE = 64 * 1024;
const MAX_STDIN = 16 * 1024;
const TIME_LIMIT_MS = 5000;
// The JVM and the CPython startup cost are environment overhead, not student
// code, so slower runtimes get a slightly larger wall clock.
const TIME_LIMIT_BY_LANGUAGE = { java: 15000, python: 6000, c: 8000, cpp: 8000 };
const limitFor = (language) => TIME_LIMIT_BY_LANGUAGE[language] || TIME_LIMIT_MS;


const LANGUAGE_ALIASES = {
  py: "python",
  python3: "python",
  "c++": "cpp",
  cplusplus: "cpp",
  cpp: "cpp",
  c: "c",
  java: "java",
  python: "python",
};

function normalizeLanguage(value) {
  const key = String(value || "").trim().toLowerCase();
  return LANGUAGE_ALIASES[key] || null;
}

/** GET /api/playground/languages — what this server can actually execute. */
const listLanguages = asyncHandler(async (req, res) => {
  const languages = await Promise.all(
    SUPPORTED_LANGUAGES.map(async (id) => {
      const info = await discoverLanguage(id).catch(() => ({ available: false, version: null }));
      return {
        id,
        label: { c: "C", cpp: "C++", java: "Java", python: "Python" }[id] || id,
        // A language is still runnable when only the remote sandbox has it.
        localToolchain: Boolean(info.available),
        version: info.version || null,
      };
    })
  );
  res.json({ success: true, languages, timeLimitMs: TIME_LIMIT_MS });
});

/** POST /api/playground/run — execute a snippet and return the full transcript. */
const runSnippet = asyncHandler(async (req, res) => {
  const language = normalizeLanguage(req.body?.language);
  const source = String(req.body?.source ?? "");
  const stdin = String(req.body?.stdin ?? "");
  // Optional extra source files (e.g. a Java project: Main.java + helpers).
  const files = Array.isArray(req.body?.files)
    ? req.body.files
        .slice(0, 10)
        .map((f) => ({ name: String(f?.name || ""), content: String(f?.content ?? "") }))
        .filter((f) => f.name && f.content)
    : [];

  if (!language) {
    return res.status(400).json({ success: false, message: "Choose one of: C, C++, Java, Python." });
  }
  if (!source.trim()) {
    return res.status(400).json({ success: false, message: "Write some code before running." });
  }
  if (source.length > MAX_SOURCE) {
    return res.status(413).json({ success: false, message: "Source code is too large (64 KB limit)." });
  }
  const extraSize = files.reduce((sum, f) => sum + f.content.length, 0);
  if (source.length + extraSize > MAX_SOURCE) {
    return res.status(413).json({ success: false, message: "Your files are too large (64 KB limit)." });
  }
  if (stdin.length > MAX_STDIN) {
    return res.status(413).json({ success: false, message: "Input is too large (16 KB limit)." });
  }

  const startedAt = Date.now();
  const timeLimitMs = limitFor(language);
  // If the student clicks "Clear" (or just closes the tab) while this run is
  // in flight, the frontend aborts its fetch — this signal makes sure the
  // compiled program is actually killed here too, instead of finishing out
  // its timeout unattended.
  const { signal, cleanup } = abortSignalForRequest(req, res);
  let result;
  try {
    result = await executeCode({ language, source, files, stdin, timeLimitMs, signal });
  } finally {
    cleanup();
  }

  // The connection is already gone — nothing to send, and no student will
  // ever see this response, so don't attempt to write to a closed socket.
  if (res.writableEnded || res.destroyed) return;

  res.json({
    success: true,
    language,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    compileOutput: result.compileOutput || "",
    message: result.message || null,
    timeMs: result.timeMs ?? Date.now() - startedAt,
    timeLimitMs,
  });

  // Save the run to the student's Dashboard history — only when they're
  // signed in (req.student is only set by optionalStudentAuth when a valid
  // account token was sent) and only AFTER the response above, so a slow or
  // failing save can never delay or break the Run result itself. Best-effort
  // and wrapped in its own try/catch: a database that hasn't run
  // migration_playground_history.sql yet, or any other transient error, just
  // means this one run doesn't get saved — never a broken Run button.
  if (req.student?.studentId) {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from("playground_runs").insert({
        student_id: req.student.studentId,
        language,
        source,
        stdin,
        status: result.status,
        stdout: (result.stdout || "").slice(0, MAX_SOURCE),
        stderr: (result.stderr || "").slice(0, MAX_SOURCE),
        compile_output: (result.compileOutput || "").slice(0, MAX_SOURCE),
        time_ms: Number.isFinite(result.timeMs) ? Math.round(result.timeMs) : null,
      });
      if (error && !/relation .* does not exist/i.test(error.message || "")) {
        // eslint-disable-next-line no-console
        console.error("Failed to save playground run:", error.message);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to save playground run:", err.message);
    }
  }
});

const HISTORY_LIMIT = 100;

// GET /api/playground/history — the signed-in student's own saved practice
// runs (source, stdin, output, verdict), newest first, for the Dashboard's
// "Programming practice" section. Scoped strictly to the caller's own
// student_id — there is no way to pass another student's id here.
const listMyHistory = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("playground_runs")
    .select("id, language, source, stdin, status, stdout, stderr, compile_output, time_ms, created_at")
    .eq("student_id", req.student.studentId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) {
    // Best-effort: a database that hasn't run the migration yet simply shows
    // an empty history instead of breaking the Dashboard.
    if (/relation .* does not exist/i.test(error.message || "")) {
      return res.json({ success: true, runs: [] });
    }
    throw new ApiError(500, "Failed to load your programming history", error.message);
  }
  res.json({
    success: true,
    runs: (data || []).map((r) => ({
      id: r.id,
      language: r.language,
      source: r.source,
      stdin: r.stdin,
      status: r.status,
      stdout: r.stdout,
      stderr: r.stderr,
      compileOutput: r.compile_output,
      timeMs: r.time_ms,
      createdAt: r.created_at,
    })),
  });
});

module.exports = { listLanguages, runSnippet, listMyHistory };
