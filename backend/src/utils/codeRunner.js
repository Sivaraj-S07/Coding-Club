/**
 * Secure remote code execution adapter (LeetCode / HackerRank style judge).
 *
 * Student code is NEVER executed in this Node process. Every run is delegated
 * to an isolated sandbox service that already enforces CPU time, wall time,
 * memory, process count and network limits — by default a Piston instance
 * (https://github.com/engineer-man/piston). Point CODE_EXEC_URL at your own
 * self-hosted Piston/Judge0-compatible instance in production.
 *
 * Env:
 *   CODE_EXEC_ENABLED  "false" disables execution entirely (falls back to the
 *                      legacy heuristic grader in codeValidator.js)
 *   CODE_EXEC_URL      execute endpoint (default: public Piston endpoint)
 *   CODE_EXEC_TIMEOUT  hard HTTP timeout in ms (default 15000)
 */

const env = require("../config/env");
const { executeLocally, languageAvailable, planJavaSource, sanitizeExtraFiles, disposeLocalSession } = require("./localRunner");
const { executeOnWandbox } = require("./wandboxRunner");

const LANGUAGES = {
  c: { piston: "c", version: "*", file: "main.c" },
  cpp: { piston: "c++", version: "*", file: "main.cpp" },
  java: { piston: "java", version: "*", file: "Main.java" },
  python: { piston: "python", version: "*", file: "main.py" },
};

const SUPPORTED_LANGUAGES = Object.keys(LANGUAGES);

const MAX_SOURCE_LENGTH = 64 * 1024; // 64 KB of source is plenty for a quiz
const MAX_OUTPUT_LENGTH = 20 * 1024;
const DEFAULT_TIME_LIMIT_MS = 3000;
const MAX_TIME_LIMIT_MS = 99999;

function executionEnabled() {
  return String(env.CODE_EXEC_ENABLED).toLowerCase() !== "false";
}

function clampTimeLimit(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TIME_LIMIT_MS;
  return Math.min(Math.max(Math.round(value), 500), MAX_TIME_LIMIT_MS);
}

function truncate(value) {
  const text = String(value ?? "");
  return text.length > MAX_OUTPUT_LENGTH ? `${text.slice(0, MAX_OUTPUT_LENGTH)}\n…output truncated…` : text;
}

// Output comparison: trailing whitespace per line and trailing blank lines are
// ignored (exactly how competitive judges compare), everything else must match.
function normalizeOutput(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n+$/g, "")
    .trim();
}

/**
 * Runs one program once against a single stdin payload.
 * @returns {Promise<{status:string, stdout:string, stderr:string, compileOutput:string, timeMs:number|null, message:string|null}>}
 *   status: ok | compile_error | runtime_error | time_limit_exceeded | judge_unavailable | invalid
 */
async function executeCode({ language, source, files = [], stdin = "", timeLimitMs, signal, localSession }) {
  const config = LANGUAGES[language];
  if (!config) {
    return result("invalid", { message: `Unsupported language: ${language}` });
  }
  if (!source || !String(source).trim()) {
    return result("invalid", { message: "No source code submitted" });
  }
  if (String(source).length > MAX_SOURCE_LENGTH) {
    return result("invalid", { message: "Source code is too large (64 KB limit)" });
  }
  if (!executionEnabled()) {
    return result("judge_unavailable", { message: "Code execution is disabled on this server" });
  }
  if (signal?.aborted) {
    return result("aborted", { message: "Stopped by the student" });
  }

  const runTimeout = clampTimeLimit(timeLimitMs);

  // Provider selection:
  //   local  — always compile/run with the pre-installed toolchain
  //   remote — always use CODE_EXEC_URL (self-hosted Piston recommended)
  //   auto   — local toolchain first (fast, no network), remote only as a
  //            fallback and only when CODE_EXEC_URL is configured. The PUBLIC
  //            Piston endpoint is whitelist-only and answers 401, so it is not
  //            a default any more: an unconfigured server simply says which
  //            toolchain to install instead of surfacing a 401 wall of text.
  const provider = String(env.CODE_EXEC_PROVIDER || "auto").toLowerCase();
  const endpoints = remoteEndpoints();
  const localArgs = { language, source, files, stdin, timeLimitMs: runTimeout, signal, session: localSession };

  if (provider === "local") {
    return executeLocally(localArgs);
  }

  // 1) Local pre-installed toolchain — fastest, no network, nothing installed
  //    on demand.
  if (provider !== "remote" && (await languageAvailable(language))) {
    const local = await executeLocally(localArgs);
    if (local.status !== "judge_unavailable") return local;
  }
  if (signal?.aborted) return result("aborted", { message: "Stopped by the student" });

  // 2) Self-hosted Piston / Judge0-compatible instance when configured.
  let remote = null;
  if (endpoints.length) {
    remote = await executeRemotely({ config, source, files, stdin, runTimeout, endpoints, signal });
    if (remote.status !== "judge_unavailable") return remote;
  }
  if (signal?.aborted) return result("aborted", { message: "Stopped by the student" });

  // 3) Key-less public sandbox (Wandbox). This is what keeps C/C++ working on
  //    servers with no gcc/g++ installed instead of showing "Judge Not Found".
  if (String(env.CODE_EXEC_FALLBACK || "wandbox").toLowerCase() !== "off") {
    const fallback = await executeOnWandbox({ language, source, files, stdin, timeLimitMs: runTimeout, signal });
    if (fallback.status !== "judge_unavailable") return fallback;
    remote = remote || fallback;
  }

  if (provider === "remote") {
    return remote || result("judge_unavailable", { message: "No remote sandbox configured" });
  }

  const local = await executeLocally(localArgs);
  if (local.status !== "judge_unavailable") return local;
  return {
    ...local,
    message:
      `No sandbox could run ${config.piston}. ${local.message || ""} ` +
      (remote && remote.message ? `Remote sandbox: ${remote.message}` : ""),
  };
}

/** Configured Piston-compatible endpoints (comma separated), public one excluded. */
function remoteEndpoints() {
  return String(env.CODE_EXEC_URL || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}


// Piston (like javac) requires the Java file name to match the public class.
function remoteFileName(config, source) {
  if (config.piston !== "java") return config.file;
  try {
    const plan = planJavaSource(source);
    // Piston writes files flat, so drop any package directory prefix.
    return plan.file.split(/[\\/]/).pop();
  } catch {
    return config.file;
  }
}

async function executeRemotely({ config, source, files, stdin, runTimeout, endpoints, signal }) {
  const urls = endpoints && endpoints.length ? endpoints : remoteEndpoints();
  if (!urls.length) {
    return result("judge_unavailable", {
      message: "No remote sandbox configured (set CODE_EXEC_URL to your own Piston instance).",
    });
  }
  let last = result("judge_unavailable", { message: "No remote sandbox configured" });
  for (const url of urls) {
    if (signal?.aborted) return result("aborted", { message: "Stopped by the student" });
    // eslint-disable-next-line no-await-in-loop
    last = await callPiston({ url, config, source, files, stdin, runTimeout, signal });
    if (last.status !== "judge_unavailable") return last;
  }
  return last;
}

async function callPiston({ url, config, source, files, stdin, runTimeout, signal }) {
  const controller = new AbortController();
  // The HTTP abort timeout must always be able to outlast the requested run
  // timeout (up to MAX_TIME_LIMIT_MS) plus network/queueing overhead, or a
  // long-running program would get its HTTP request aborted before the judge
  // even finishes — surfacing a misleading "judge unreachable" instead of the
  // real result. Mirrors the same guard in wandboxRunner.js.
  const httpTimeout = setTimeout(
    () => controller.abort(),
    Math.max(Number(env.CODE_EXEC_TIMEOUT) || 15000, Number(runTimeout) + 15000)
  );
  // Forward an external stop signal (e.g. the student hit Clear, or the
  // request that asked for this run was dropped) straight into the HTTP
  // call, so a remote judge run stops as promptly as a local one.
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort, { once: true });
  const wasExternallyAborted = () => Boolean(signal?.aborted);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.CODE_EXEC_TOKEN ? { Authorization: `Bearer ${env.CODE_EXEC_TOKEN}` } : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        language: config.piston,
        version: config.version,
        files: [{ name: remoteFileName(config, source), content: String(source) }, ...sanitizeExtraFiles(files, remoteFileName(config, source))],
        stdin: String(stdin ?? ""),
        compile_timeout: 10000,
        run_timeout: runTimeout,
        run_memory_limit: 256 * 1024 * 1024,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // 401/403 is the public Piston whitelist wall — say what to do instead of
      // dumping the provider's HTML/JSON at the student.
      if (response.status === 401 || response.status === 403) {
        return result("judge_unavailable", {
          message:
            `Remote sandbox rejected the request (${response.status}). ` +
            `The public Piston API is whitelist-only — host your own instance ` +
            `(docker compose -f docker-compose.judge.yml up -d) and point CODE_EXEC_URL at it, ` +
            `or install the local toolchain.`,
        });
      }
      if (response.status === 429) {
        return result("judge_unavailable", { message: "Remote sandbox rate limit reached. Try again in a moment." });
      }
      return result("judge_unavailable", {
        message: `Judge responded with ${response.status}. ${truncate(body).slice(0, 300)}`,
      });
    }

    const payload = await response.json();
    const compile = payload.compile || {};
    const run = payload.run || {};

    if (compile.code && Number(compile.code) !== 0) {
      return result("compile_error", {
        compileOutput: truncate(compile.stderr || compile.output || "Compilation failed"),
      });
    }

    // Piston reports a killed process via signal (SIGKILL for the wall clock).
    const killedByTimeout =
      run.signal === "SIGKILL" || /timed?\s*out/i.test(String(run.stderr || ""));
    if (killedByTimeout) {
      return result("time_limit_exceeded", {
        stdout: truncate(run.stdout),
        stderr: truncate(run.stderr),
        message: `Time limit exceeded (${runTimeout} ms)`,
      });
    }

    if (Number(run.code) !== 0) {
      return result("runtime_error", {
        stdout: truncate(run.stdout),
        stderr: truncate(run.stderr || run.output),
        message: run.signal ? `Program terminated by ${run.signal}` : "Runtime error",
      });
    }

    return result("ok", { stdout: truncate(run.stdout), stderr: truncate(run.stderr) });
  } catch (error) {
    const wasAbort = error && (error.name === "AbortError" || error.name === "TimeoutError");
    if (wasAbort && wasExternallyAborted()) {
      return result("aborted", { message: "Stopped by the student" });
    }
    return result("judge_unavailable", {
      message: wasAbort ? "The judge did not respond in time" : `Judge unreachable: ${error.message}`,
    });
  } finally {
    clearTimeout(httpTimeout);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}


function result(status, extra = {}) {
  return {
    status,
    stdout: "",
    stderr: "",
    compileOutput: "",
    timeMs: null,
    message: null,
    ...extra,
  };
}

/**
 * Anti-cheat: catches submissions that print the expected answers instead of
 * computing them. Two independent signals, both required to be safe:
 *  1. the program never reads stdin although every test feeds input, and
 *  2. two or more distinct expected outputs appear verbatim in the source.
 * A genuine solution fails neither check.
 */
const STDIN_PATTERNS = {
  c: /\b(scanf|fscanf|gets|fgets|getchar|getline|read)\s*\(/,
  cpp: /\b(cin|scanf|getline|getchar|fgets|read)\b/,
  java: /\b(Scanner|BufferedReader|System\s*\.\s*in|readLine|InputStreamReader)\b/,
  python: /\b(input|sys\s*\.\s*stdin|read|readline|readlines|fileinput)\b/,
};

function detectHardcoding({ language, source, testCases }) {
  const tests = Array.isArray(testCases) ? testCases : [];
  const testsWithInput = tests.filter((t) => String(t.input ?? "").trim() !== "");
  if (testsWithInput.length < 2) return { hardcoded: false, reason: null };

  const pattern = STDIN_PATTERNS[language];
  const readsInput = pattern ? pattern.test(String(source)) : true;
  if (readsInput) return { hardcoded: false, reason: null };

  const code = String(source);
  const distinctLiterals = new Set(
    tests
      .map((t) => normalizeOutput(t.expectedOutput))
      .filter((expected) => expected && expected.length >= 1 && code.includes(expected))
  );
  if (distinctLiterals.size >= 2) {
    return {
      hardcoded: true,
      reason:
        "Submission prints the expected answers without reading the input. Solve the problem programmatically.",
    };
  }
  return { hardcoded: false, reason: null };
}

/**
 * Runs a submission against a list of test cases and reports how many passed.
 * Execution stops early on a compile error (every case would fail identically).
 *
 * @returns {Promise<{status:string, passed:number, total:number, ratio:number,
 *   cases:Array, message:string|null, compileOutput:string}>}
 */
async function runTestCases({ language, source, testCases, timeLimitMs, revealAll = false, expectedOutput, signal }) {
  let tests = (Array.isArray(testCases) ? testCases : []).filter(Boolean);
  // Legacy questions have no test cases, only a single expected stdout —
  // treat that as one input-less test so they still grade by execution.
  if (!tests.length && expectedOutput && String(expectedOutput).trim()) {
    tests = [{ name: "Expected output", input: "", expectedOutput, hidden: true }];
  }
  if (!tests.length) {
    return { status: "no_tests", passed: 0, total: 0, ratio: 0, cases: [], results: [], message: null, compileOutput: "" };
  }

  const cheat = detectHardcoding({ language, source, testCases: tests });
  if (cheat.hardcoded) {
    return {
      status: "hardcoded",
      passed: 0,
      total: tests.length,
      ratio: 0,
      cases: [],
      results: [],
      message: cheat.reason,
      compileOutput: "",
    };
  }

  const cases = [];
  let passed = 0;
  let status = "ok";
  let message = null;
  let compileOutput = "";

  // Compile once per submission; never reuse artifacts across students/requests.
  const localSession = { dir: null, compiled: false };
  try {
  for (let index = 0; index < tests.length; index += 1) {
    if (signal?.aborted) {
      return { status: "aborted", passed, total: tests.length, ratio: 0, cases, results: cases, message: "Stopped by the student", compileOutput: "" };
    }
    const test = tests[index];
    // Sequential on purpose: keeps load on the sandbox predictable and stays
    // inside the rate limits of shared judge instances.
    // eslint-disable-next-line no-await-in-loop
    const run = await executeCode({ language, source, stdin: test.input, timeLimitMs, signal, localSession });

    if (run.status === "aborted") {
      return { status: "aborted", passed, total: tests.length, ratio: 0, cases, results: cases, message: "Stopped by the student", compileOutput: "" };
    }
    if (run.status === "compile_error") {
      compileOutput = run.compileOutput;
      return {
        status: "compile_error",
        passed: 0,
        total: tests.length,
        ratio: 0,
        cases: [],
        results: [],
        message: "Compilation failed",
        compileOutput,
      };
    }
    if (run.status === "judge_unavailable" || run.status === "invalid") {
      return {
        status: run.status,
        passed,
        total: tests.length,
        ratio: 0,
        cases,
        results: cases,
        message: run.message,
        compileOutput: "",
      };
    }

    const expected = normalizeOutput(test.expectedOutput);
    const actual = normalizeOutput(run.stdout);
    const ok = run.status === "ok" && expected === actual;
    if (ok) passed += 1;
    else if (run.status === "time_limit_exceeded") status = status === "ok" ? "time_limit_exceeded" : status;
    else if (run.status === "runtime_error") status = status === "ok" ? "runtime_error" : status;

    const visible = revealAll || !test.hidden;
    // A hidden case that FAILS reveals its Input and Expected Output so the
    // student can see exactly what tripped them up — but never its actual
    // output/stderr (that would give away more than the case itself), and a
    // hidden case that PASSES stays fully hidden, same as before.
    const revealFailedHidden = test.hidden && !ok && !revealAll;
    const showAnswer = visible || revealFailedHidden;
    cases.push({
      index: index + 1,
      name: test.name || `Test case ${index + 1}`,
      hidden: !!test.hidden,
      passed: ok,
      status: run.status,
      input: showAnswer ? String(test.input ?? "") : null,
      expectedOutput: showAnswer ? String(test.expectedOutput ?? "") : null,
      actualOutput: visible ? run.stdout : null,
      stdout: visible ? run.stdout : null,
      stderr: visible ? run.stderr : null,
      message: run.message,
    });
  }

  if (passed === tests.length) status = "ok";
  else if (status === "ok") status = "wrong_answer";
  if (passed === 0 && status === "wrong_answer") message = "No test cases passed";

  return {
    status,
    passed,
    total: tests.length,
    ratio: tests.length ? passed / tests.length : 0,
    cases,
    results: cases, // alias used by the student UI
    message,
    compileOutput,
  };
  } finally { await disposeLocalSession(localSession); }
}

module.exports = {
  LANGUAGES,
  SUPPORTED_LANGUAGES,
  executeCode,
  runTestCases,
  detectHardcoding,
  normalizeOutput,
  executionEnabled,
  clampTimeLimit,
};
