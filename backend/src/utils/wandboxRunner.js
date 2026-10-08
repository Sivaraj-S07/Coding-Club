/**
 * Zero-configuration remote judge (Wandbox).
 *
 * Why this exists: the public Piston endpoint became whitelist-only and now
 * answers 401, which is what produced the "Judge unavailable / Judge Not Found"
 * screens for C and C++ on servers that have no local gcc/g++ installed.
 *
 * Wandbox (https://wandbox.org) is a free, key-less, sandboxed compile service
 * that supports every language this app allows: C (gcc), C++ (gcc), Java
 * (OpenJDK) and Python (CPython). It is used ONLY as a fallback:
 *   1. local pre-installed toolchain  (fastest, preferred)
 *   2. self-hosted Piston via CODE_EXEC_URL
 *   3. Wandbox                        (this module)
 *
 * Nothing is ever installed on demand, and hidden test cases never leave the
 * request cycle — only the student's source + one stdin payload are sent.
 */

const env = require("../config/env");

const MAX_OUTPUT_LENGTH = 20 * 1024;

// Pinned stable compilers (heads are experimental and occasionally broken).
const COMPILERS = {
  c: { compiler: "gcc-13.2.0-c", options: "warning", raw: ["-O2", "-lm"] },
  cpp: { compiler: "gcc-13.2.0", options: "warning,gnu++17", raw: ["-O2"] },
  java: { compiler: "openjdk-jdk-22+36", options: "", raw: [] },
  python: { compiler: "cpython-3.13.8", options: "", raw: [] },
};

function compilerFor(language) {
  const override = String(env.WANDBOX_COMPILERS || "")
    .split(",")
    .map((pair) => pair.split("=").map((s) => s.trim()))
    .find(([id]) => id === language);
  const base = COMPILERS[language];
  if (!base) return null;
  return override && override[1] ? { ...base, compiler: override[1] } : base;
}

function truncate(value) {
  const text = String(value ?? "");
  return text.length > MAX_OUTPUT_LENGTH ? `${text.slice(0, MAX_OUTPUT_LENGTH)}\n…output truncated…` : text;
}

function result(status, extra = {}) {
  return { status, stdout: "", stderr: "", compileOutput: "", timeMs: null, message: null, ...extra };
}

/**
 * Wandbox always writes the entry file as `prog.java`, so a `public` entry
 * class (or a package declaration) would not compile there. Both are safe to
 * relax for a sandbox run — additional classes keep their own file names.
 */
function adaptJavaEntry(source) {
  return String(source)
    .replace(/^\s*package\s+[\w.\s]+;\s*$/m, "")
    .replace(/\bpublic\s+(?=(?:final\s+|abstract\s+|strictfp\s+)*(?:class|interface|enum|record)\s)/, "");
}

function endpoint() {
  return String(env.WANDBOX_URL || "https://wandbox.org/api/compile.json").trim();
}

/**
 * @param {{language:string, source:string, files?:Array<{name:string,content:string}>, stdin?:string, timeLimitMs?:number}} input
 */
async function executeOnWandbox({ language, source, files = [], stdin = "", timeLimitMs = 5000, signal }) {
  const config = compilerFor(language);
  if (!config) return result("judge_unavailable", { message: `Unsupported language: ${language}` });
  if (signal?.aborted) return result("aborted", { message: "Stopped by the student" });

  const entry = language === "java" ? adaptJavaEntry(source) : String(source);
  const extra = (files || [])
    .filter((f) => f && f.name && String(f.content ?? "").length)
    .map((f) => ({ file: String(f.name).replace(/[\\/]+/g, "/"), code: String(f.content) }));

  const controller = new AbortController();
  const httpTimeout = setTimeout(
    () => controller.abort(),
    Math.max(Number(env.CODE_EXEC_TIMEOUT) || 15000, Number(timeLimitMs) + 15000)
  );
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort, { once: true });
  const wasExternallyAborted = () => Boolean(signal?.aborted);
  const startedAt = Date.now();

  try {
    const response = await fetch(endpoint(), {
      method: "POST",
      // Wandbox rejects requests without a User-Agent with 403.
      headers: { "Content-Type": "application/json", "User-Agent": "eduverse-judge/1.0" },
      signal: controller.signal,
      body: JSON.stringify({
        compiler: config.compiler,
        code: entry,
        codes: extra,
        stdin: String(stdin ?? ""),
        options: config.options,
        "compiler-option-raw": config.raw.join("\n"),
        save: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return result("judge_unavailable", {
        message: `Remote sandbox responded with ${response.status}. ${truncate(body).slice(0, 200)}`,
      });
    }

    const payload = await response.json();
    const timeMs = Date.now() - startedAt;
    const compileError = String(payload.compiler_error || "");
    const programError = String(payload.program_error || "");
    const status = Number(payload.status);

    // Compilation failed: there is compiler output and no program ever ran.
    if (compileError.trim() && !String(payload.program_output || "").trim() && status !== 0) {
      return result("compile_error", { compileOutput: truncate(compileError), timeMs });
    }
    if (payload.signal) {
      return result(/kill/i.test(String(payload.signal)) ? "time_limit_exceeded" : "runtime_error", {
        stdout: truncate(payload.program_output),
        stderr: truncate(programError),
        timeMs,
        message: `Program terminated by ${payload.signal}`,
      });
    }
    if (status !== 0) {
      return result("runtime_error", {
        stdout: truncate(payload.program_output),
        stderr: truncate(programError || compileError),
        timeMs,
        message: `Program exited with code ${payload.status}`,
      });
    }
    return result("ok", {
      stdout: truncate(payload.program_output),
      stderr: truncate(programError),
      compileOutput: truncate(compileError),
      timeMs,
    });
  } catch (error) {
    const wasAbort = error && (error.name === "AbortError" || error.name === "TimeoutError");
    if (wasAbort && wasExternallyAborted()) {
      return result("aborted", { message: "Stopped by the student" });
    }
    // Otherwise an aborted request almost always means the program never
    // terminated (infinite loop / blocking read), so report it as a time
    // limit, not as a broken judge.
    if (wasAbort) {
      return result("time_limit_exceeded", {
        message: `Time limit exceeded — your program did not finish within ${timeLimitMs} ms.`,
      });
    }
    return result("judge_unavailable", { message: `Remote sandbox unreachable: ${error.message}` });
  } finally {
    clearTimeout(httpTimeout);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

module.exports = { executeOnWandbox, WANDBOX_LANGUAGES: Object.keys(COMPILERS) };
