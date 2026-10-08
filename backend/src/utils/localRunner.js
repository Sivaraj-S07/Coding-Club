/**
 * Local judge (pre-installed runtimes only).
 *
 * Hard rule enforced by this module: the server NEVER installs, downloads or
 * bootstraps a language runtime while a student presses Run or Submit. Every
 * toolchain is discovered ONCE at boot (`warmupRuntimes()`), from a list of
 * real executables on disk. If a runtime is missing we say so immediately —
 * we never shell out to a package manager and never hit a store/installer
 * stub (that is what produced the "Downloading Python…" hang on Windows).
 *
 * Other hardening:
 *   - each run gets a fresh temp directory that is deleted afterwards
 *   - the wall-clock limit applies to the STUDENT PROGRAM only; compilation
 *     and toolchain discovery have their own separate budgets
 *   - stdout/stderr capped, stdin closed after writing
 *   - no shell: every compiler/interpreter is spawned with an argv array
 *   - the child inherits a minimal env (no DB URL, no JWT secret, no keys)
 */

const { StringDecoder } = require("string_decoder");
const { spawn } = require("child_process");
const fs = require("fs/promises");
const fsSync = require("fs");
const os = require("os");
const path = require("path");

const MAX_OUTPUT_LENGTH = 20 * 1024;
const IS_WINDOWS = process.platform === "win32";
const EXE = IS_WINDOWS ? ".exe" : "";

// Budgets that are NOT part of the student's time limit.
const PROBE_TIMEOUT_MS = 20000; // boot-time toolchain discovery
const COMPILE_TIMEOUT_MS = 20000; // gcc/g++/javac

// Per-language virtual-memory ceiling (KB) applied to the STUDENT PROGRAM
// only (never to compilation — gcc/g++/javac legitimately need more headroom
// than the program they produce). This is a backstop against runaway
// allocation (an accidental `while(true) malloc(...)`, a huge unintended
// array) that would otherwise let one submission page-thrash or OOM the
// whole judge host well before the wall-clock timeout below ever fires.
// Java is deliberately absent here: the JVM reserves a large virtual address
// space up front regardless of actual usage, so `ulimit -v` would stop it
// from starting at all — its heap is capped with -Xmx in TOOLCHAIN.java.run
// instead. On Windows there is no ulimit equivalent in this codebase; the
// wall-clock timeout and output cap below remain the primary defense there.
const POSIX_MEMORY_LIMIT_KB = { c: 786432, cpp: 786432, python: 1048576 }; // 768MB / 768MB / 1GB
// Backstop against a program spawning many child processes/threads
// (accidental recursion via os.fork()/multiprocessing, a typo'd loop that
// launches subprocesses). Generous enough that no legitimate quiz solution
// should ever come close.
// RLIMIT_NPROC counts all threads for the service UID, not only this program.
// Leave headroom for Node workers and the JVM while retaining a finite backstop.
const POSIX_PROCESS_LIMIT = 512;
// A quiz program has no legitimate reason to write large files to disk;
// cap it well under the host's available space so a runaway write can't
// fill the disk out from under other students' concurrent runs.
const POSIX_FILE_SIZE_LIMIT_KB = 20 * 1024; // 20MB

/**
 * Wrap the STUDENT PROGRAM's cmd/args so it runs under POSIX resource
 * limits (ulimit) instead of with none at all. Never used for the compiler
 * itself. A plain `/bin/sh -c` prelude — `exec "$0" "$@"` hands off to the
 * real argv array untouched, so nothing here is shell-interpolated and
 * there is no injection surface even though a shell is involved.
 *
 * No-op on Windows (no ulimit equivalent) and safely falls through to the
 * existing "toolchain missing" handling if /bin/sh itself is unavailable —
 * `spawnWithTimeout` reports that as `judge_unavailable` exactly like a
 * missing compiler would, and the multi-tier fallback in codeRunner.js
 * (local -> configured remote -> Wandbox) takes it from there.
 */
function withResourceLimits(language, cmd, args) {
  if (IS_WINDOWS) return { cmd, args };
  const memKb = POSIX_MEMORY_LIMIT_KB[language];
  const prelude = [
    `ulimit -u ${POSIX_PROCESS_LIMIT} 2>/dev/null`,
    `ulimit -f ${POSIX_FILE_SIZE_LIMIT_KB} 2>/dev/null`,
    ...(memKb ? [`ulimit -v ${memKb} 2>/dev/null`] : []),
  ].join("; ");
  return { cmd: "/bin/sh", args: ["-c", `${prelude}; exec "$0" "$@"`, cmd, ...args] };
}

/**
 * Windows "App execution aliases" (and the new Python install-manager shims)
 * are stubs that trigger a download — "Downloading… Installing Python 3.14.7"
 * — instead of running anything. Never use them.
 */
function isInstallerStub(binaryPath) {
  if (!IS_WINDOWS) return false;
  if (/WindowsApps/i.test(binaryPath)) return true;
  try {
    return fsSync.statSync(binaryPath).size === 0;
  } catch {
    return false;
  }
}

function candidatesFor(names, envOverride) {
  const list = [];
  const override = envOverride ? String(process.env[envOverride] || "").trim() : "";
  if (override) list.push(override);
  for (const name of names) list.push(IS_WINDOWS ? `${name}${EXE}` : name);
  return list;
}

/**
 * Resolve an executable that lives on PATH to its real absolute location.
 * Used to derive a JDK home from whatever `java`/`javac` the PATH exposes
 * (Nix, asdf, sdkman and Homebrew all install through symlink farms).
 */
function resolveOnPath(name) {
  const bare = name.replace(new RegExp(`${EXE}$`, "i"), "");
  const dirs = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, `${bare}${EXE}`);
    try {
      if (!fsSync.statSync(candidate).isFile()) continue;
      return fsSync.realpathSync(candidate);
    } catch {
      /* not here */
    }
  }
  return null;
}

/**
 * Turn a candidate list into absolute paths.
 *
 * This is the fix for the "Downloading Python…" hang: a bare name such as
 * `python.exe` was handed straight to spawn(), which resolves it through PATH
 * and happily launched the Microsoft Store / install-manager stub, bypassing
 * the isInstallerStub() check entirely. Now every bare name is resolved
 * against PATH first, so stubs are filtered out before they can ever run.
 */
function absoluteCandidates(list) {
  const out = [];
  for (const entry of list) {
    if (!entry) continue;
    if (path.isAbsolute(entry)) {
      out.push(entry);
      continue;
    }
    const resolved = resolveOnPath(entry);
    if (resolved) out.push(resolved);
  }
  return [...new Set(out)].filter((bin) => !isInstallerStub(bin));
}


/**
 * Java needs extra care: on many servers `javac` is NOT on PATH even though a
 * JDK is installed (JAVA_HOME only), and on Debian/Ubuntu the real binaries
 * live under /usr/lib/jvm/<dist>/bin. Probe all of those before giving up.
 */
function javaCandidates(tool /* "javac" | "java" */) {
  const envKey = tool === "javac" ? "JAVAC_BIN" : "JAVA_BIN";
  const list = candidatesFor([tool], envKey);

  // JAVA_HOME may point at the JDK root, a macOS bundle, or (Nix) a package
  // root whose real JDK sits under lib/openjdk.
  const homeLayouts = [
    ["bin"],
    ["Contents", "Home", "bin"],
    ["lib", "openjdk", "bin"],
    ["jdk", "bin"],
  ];
  for (const home of [process.env.JAVA_HOME, process.env.JDK_HOME]) {
    const trimmed = String(home || "").trim();
    if (!trimmed) continue;
    for (const layout of homeLayouts) list.push(path.join(trimmed, ...layout, `${tool}${EXE}`));
  }

  // If either java or javac is reachable through PATH (possibly via symlinks),
  // its sibling in the same real bin/ directory is the matching tool.
  for (const known of ["javac", "java"]) {
    const real = resolveOnPath(known);
    if (real) list.push(path.join(path.dirname(real), `${tool}${EXE}`));
  }

  const roots = IS_WINDOWS
    ? ["C:\\Program Files\\Java", "C:\\Program Files\\Eclipse Adoptium", "C:\\Program Files (x86)\\Java"]
    : ["/usr/lib/jvm", "/usr/local/jvm", "/opt/java", "/opt/jdk", "/Library/Java/JavaVirtualMachines"];
  for (const root of roots) {
    let entries = [];
    try {
      entries = fsSync.readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries.sort().reverse()) {
      list.push(path.join(root, entry, "bin", `${tool}${EXE}`));
      // macOS bundle layout
      list.push(path.join(root, entry, "Contents", "Home", "bin", `${tool}${EXE}`));
    }
  }
  // de-duplicate, keep order, drop store/installer stubs
  return absoluteCandidates(list);

}

/**
 * GNU/LLVM toolchain discovery (gcc, g++, clang, clang++, python).
 *
 * A plain PATH lookup is not enough in practice: on Windows the compilers ship
 * inside MSYS2 / MinGW-w64 / TDM-GCC / WinLibs / Strawberry Perl / LLVM
 * directories that the installer often does NOT add to PATH, and on Linux/macOS
 * they can live in Homebrew, Nix or versioned bin directories (gcc-13, g++-13).
 * We probe every one of those real locations before declaring a language
 * "NOT INSTALLED", which is what previously rejected C and C++ on servers that
 * actually had a compiler on disk.
 */
function toolchainCandidates(names, envOverride, { versioned = false } = {}) {
  const list = candidatesFor(names, envOverride);

  // Versioned unix binaries: gcc-14 … gcc-9 (Debian/Homebrew keep these).
  if (versioned && !IS_WINDOWS) {
    for (const name of names) {
      for (let v = 15; v >= 8; v--) list.push(`${name}-${v}`);
    }
  }

  const dirs = [];
  if (IS_WINDOWS) {
    const drives = ["C:", "D:"];
    for (const d of drives) {
      dirs.push(
        `${d}\\msys64\\ucrt64\\bin`,
        `${d}\\msys64\\mingw64\\bin`,
        `${d}\\msys64\\clang64\\bin`,
        `${d}\\msys64\\usr\\bin`,
        `${d}\\mingw64\\bin`,
        `${d}\\MinGW\\bin`,
        `${d}\\TDM-GCC-64\\bin`,
        `${d}\\cygwin64\\bin`,
        `${d}\\Strawberry\\c\\bin`,
        `${d}\\Program Files\\LLVM\\bin`,
        `${d}\\Program Files\\mingw-w64`,
        `${d}\\Program Files (x86)\\mingw-w64`
      );
    }
    for (const base of [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env.ChocolateyInstall]) {
      if (base) dirs.push(path.join(base, "bin"), path.join(base, "mingw64", "bin"));
    }
    // mingw-w64 installs one level deeper: <root>\<flavour>\mingw64\bin
    for (const root of [...dirs]) {
      let entries = [];
      try {
        entries = fsSync.readdirSync(root);
      } catch {
        continue;
      }
      for (const entry of entries) {
        dirs.push(path.join(root, entry, "mingw64", "bin"), path.join(root, entry, "bin"));
      }
    }
  } else {
    dirs.push(
      "/usr/bin",
      "/bin",
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/usr/local/opt/llvm/bin",
      "/opt/local/bin",
      "/run/current-system/sw/bin",
      "/nix/var/nix/profiles/default/bin"
    );
  }

  // Real (non-store) Python installations on Windows: C:\PythonXY,
  // %LOCALAPPDATA%\Programs\Python\PythonXY, Program Files\PythonXY.
  if (IS_WINDOWS && names.some((n) => n.startsWith("python"))) {
    const pyRoots = [
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "Python") : null,
      "C:\\Program Files",
      "C:\\Program Files (x86)",
      "C:\\",
    ].filter(Boolean);
    for (const root of pyRoots) {
      let entries = [];
      try {
        entries = fsSync.readdirSync(root);
      } catch {
        continue;
      }
      for (const entry of entries.filter((e) => /^Python\d/i.test(e)).sort().reverse()) {
        dirs.push(path.join(root, entry));
      }
    }
  }

  for (const dir of dirs) {
    for (const name of names) list.push(path.join(dir, `${name}${EXE}`));
  }
  return absoluteCandidates(list);
}



/**
 * Java forces the file name to match the public class name, so we cannot
 * blindly write Main.java. Detect the public/first top-level class (and any
 * package declaration) and lay the source out exactly the way javac expects.
 */
function planJavaSource(source) {
  const text = String(source || "");
  // strip comments and string literals so declarations inside them do not match
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');

  const pkgMatch = stripped.match(/^\s*package\s+([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*;/m);
  const pkg = pkgMatch ? pkgMatch[1].replace(/\s+/g, "") : "";

  const publicMatch = stripped.match(/\bpublic\s+(?:final\s+|abstract\s+|strictfp\s+)*(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/);
  const mainMatch = stripped.match(/(?:class|record|enum)\s+([A-Za-z_$][\w$]*)[^;{]*\{[\s\S]*?static\s+(?:final\s+)?void\s+main\s*\(/);
  const anyMatch = stripped.match(/\b(?:class|record|enum)\s+([A-Za-z_$][\w$]*)/);

  // The class holding main is what we execute; the file must be named after
  // the PUBLIC class when one exists.
  const runClass = (mainMatch && mainMatch[1]) || (publicMatch && publicMatch[1]) || (anyMatch && anyMatch[1]) || "Main";
  const fileClass = (publicMatch && publicMatch[1]) || runClass;

  const relDir = pkg ? pkg.split(".").join(path.sep) : "";
  return {
    file: path.join(relDir, `${fileClass}.java`),
    mainClass: pkg ? `${pkg}.${runClass}` : runClass,
  };
}

// argv builders per language. `compile` may be null for interpreted languages.
const TOOLCHAIN = {
  python: {
    label: "Python",
    file: "main.py",
    binaries: () =>
      toolchainCandidates(
        ["python3", "python3.13", "python3.12", "python3.11", "python3.10", "python"],
        "PYTHON_BIN"
      ),
    probeArgs: ["-I", "-c", "import sys;print('Python '+sys.version.split()[0])"],
    // Executed once at boot: proves the interpreter really runs code instead of
    // downloading a runtime the first time a student presses Run.
    smokeArgs: ["-I", "-c", "print('__judge_runtime_ok__')"],
    compile: null,
    run: (dir, bin) => ({ cmd: bin, args: ["-I", "-u", path.join(dir, "main.py")] }),

  },
  c: {
    label: "C (gcc)",
    file: "main.c",
    binaries: () => toolchainCandidates(["gcc", "cc", "clang", "x86_64-w64-mingw32-gcc"], "GCC_BIN", { versioned: true }),
    probeArgs: ["--version"],
    compile: (dir, bin, plan, extras = []) => ({
      cmd: bin,
      args: [path.join(dir, "main.c"), ...extras.filter((f) => /\.c$/i.test(f)), "-O2", "-o", path.join(dir, `main${EXE}`), "-lm"],
    }),
    run: (dir) => ({ cmd: path.join(dir, `main${EXE}`), args: [] }),
  },
  cpp: {
    label: "C++ (g++)",
    file: "main.cpp",
    binaries: () => toolchainCandidates(["g++", "c++", "clang++", "x86_64-w64-mingw32-g++"], "GPP_BIN", { versioned: true }),
    probeArgs: ["--version"],
    compile: (dir, bin, plan, extras = []) => ({
      cmd: bin,
      args: [
        path.join(dir, "main.cpp"),
        ...extras.filter((f) => /\.(cpp|cc|cxx)$/i.test(f)),
        "-O2",
        "-std=c++17",
        "-o",
        path.join(dir, `main${EXE}`),
      ],
    }),
    run: (dir) => ({ cmd: path.join(dir, `main${EXE}`), args: [] }),
  },
  java: {
    label: "Java (JDK)",
    file: "Main.java",
    binaries: () => javaCandidates("javac"),
    probeArgs: ["-version"],
    plan: (source) => planJavaSource(source),
    compile: (dir, bin, plan, extras = []) => ({
      cmd: bin,
      // -encoding UTF-8 keeps javac deterministic regardless of server locale;
      // sources are compiled into the same dir, which becomes the classpath.
      // Extra .java files (Main + helper classes) are compiled together.
      args: [
        "-nowarn",
        "-encoding",
        "UTF-8",
        "-d",
        dir,
        path.join(dir, plan.file),
        ...extras.filter((f) => /\.java$/i.test(f)),
      ],
    }),
    run: (dir, bin, plan) => {
      // Prefer the `java` that ships next to the discovered `javac`, then any
      // resolvable java, then plain `java` from PATH.
      const sibling = path.join(path.dirname(bin), `java${EXE}`);
      let cmd = `java${EXE}`;
      if (path.isAbsolute(sibling) && fsSync.existsSync(sibling)) {
        cmd = sibling;
      } else {
        const found = javaCandidates("java").find((c) => path.isAbsolute(c) && fsSync.existsSync(c));
        if (found) cmd = found;
      }
      return {
        cmd,
        args: [
          "-XX:+UseSerialGC",
          "-XX:TieredStopAtLevel=1",
          "-Xshare:auto",
          "-Xss2m",
          // Heap cap: without this the JVM defaults to a large fraction of
          // host RAM, so one submission's `new int[1_000_000_000]` could
          // pressure the whole judge host. 256m is comfortably more than
          // any quiz-scale program needs. (Deliberately not paired with
          // ulimit -v — see POSIX_MEMORY_LIMIT_KB above.)
          "-Xmx256m",
          "-cp",
          dir,
          plan.mainClass,
        ],
      };
    },
  },
};

const CHILD_ENV = {
  PATH: process.env.PATH,
  HOME: os.tmpdir(),
  LANG: "C.UTF-8",
  PYTHONDONTWRITEBYTECODE: "1",
  PYTHONUNBUFFERED: "1",
  PYTHONNOUSERSITE: "1",
  // Belt and braces: nothing here may ever install a runtime on demand.
  PIP_NO_INPUT: "1",
  PIP_DISABLE_PIP_VERSION_CHECK: "1",
  PYTHON_MANAGER_AUTOMATIC_INSTALL: "0", // Python install manager (py.exe 3.14+)
  PYLAUNCHER_ALLOW_INSTALL: "0",
  PYTHON_MANAGER_OFFLINE: "1",

  // Java resolves its runtime image relative to the launcher, but some
  // distributions still rely on JAVA_HOME being present.
  ...(process.env.JAVA_HOME ? { JAVA_HOME: process.env.JAVA_HOME } : {}),
  ...(IS_WINDOWS && process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
  ...(IS_WINDOWS && process.env.TEMP ? { TEMP: process.env.TEMP, TMP: process.env.TEMP } : {}),
};

/** Never leak the server temp path into compiler/runtime messages. */
function sanitizePaths(value, dir) {
  const text = String(value ?? "");
  if (!dir) return text;
  const variants = [dir + path.sep, dir];
  let out = text;
  for (const v of variants) out = out.split(v).join("");
  return out;
}

function truncate(value) {
  const text = String(value ?? "");
  return text.length > MAX_OUTPUT_LENGTH ? `${text.slice(0, MAX_OUTPUT_LENGTH)}\n…output truncated…` : text;
}

/**
 * `signal` (a standard AbortSignal) lets the caller terminate the child the
 * moment the student — or the HTTP request that asked for this run — goes
 * away, instead of leaving the process to run out its full timeout budget in
 * the background. Same SIGKILL-the-process-group path as a timeout, just
 * triggered externally instead of by the internal clock.
 */
function spawnWithTimeout({ cmd, args, cwd, stdin = "", timeoutMs, signal }) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      return resolve({ error: null, timedOut: false, aborted: true, code: null, stdout: "", stderr: "" });
    }

    let child;
    try {
      child = spawn(cmd, args, {
        cwd,
        env: CHILD_ENV,
        detached: !IS_WINDOWS,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (err) {
      return resolve({ error: err, timedOut: false, aborted: false, code: null, stdout: "", stderr: String(err.message) });
    }
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let settled = false;

    const killChild = () => {
      try {
        if (IS_WINDOWS) child.kill("SIGKILL");
        else process.kill(-child.pid, "SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killChild();
    }, timeoutMs);

    const onAbort = () => {
      aborted = true;
      killChild();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(payload);
    };

    child.stdout.on("data", (d) => {
      const text = stdoutDecoder.write(d);
      if (stdout.length < MAX_OUTPUT_LENGTH * 2) stdout += text.slice(0, MAX_OUTPUT_LENGTH * 2 - stdout.length);
    });
    child.stderr.on("data", (d) => {
      const text = stderrDecoder.write(d);
      if (stderr.length < MAX_OUTPUT_LENGTH * 2) stderr += text.slice(0, MAX_OUTPUT_LENGTH * 2 - stderr.length);
    });
    child.on("error", (err) => finish({ error: err, timedOut, aborted, code: null, stdout, stderr: String(err.message) }));
    child.on("close", (code) => {
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
      finish({ error: null, timedOut, aborted, code, stdout, stderr });
    });

    // A program that never reads stdin (or exits immediately, e.g. the JVM
    // after an exception) closes the pipe: writing then emits an async EPIPE
    // that would otherwise crash the whole backend process.
    child.stdin.on("error", () => {});
    try {
      child.stdin.end(String(stdin ?? ""));
    } catch {
      /* the process may already have exited */
    }
  });
}

/**
 * Toolchain discovery. Runs once per language and is cached forever, so no
 * Run/Submit request ever pays for it (warmupRuntimes() does it at boot).
 * Resolves to { available, bin, version, reason }.
 */
const discovery = new Map();

const PROBE_MARKER = "__judge_runtime_ok__";
// Any of these in a probe banner means the binary is a downloader/installer
// shim (Microsoft Store alias, Python install manager, `command-not-found`
// helper) rather than a real runtime. Never accept one.
const INSTALLER_NOISE = /(downloading|installing|install manager|microsoft store|app installer|command not found|not recognized)/i;

async function probeBinary(bin, tool) {
  if (isInstallerStub(bin)) return null;
  const res = await spawnWithTimeout({
    cmd: bin,
    args: tool.probeArgs,
    cwd: os.tmpdir(),
    timeoutMs: PROBE_TIMEOUT_MS,
  });
  if (res.error || res.timedOut) return null;
  const banner = String(res.stdout || res.stderr || "");
  const version = banner.split("\n")[0].trim();
  // Store stubs print nothing and exit 0/9009 — treat an empty banner as a miss.
  if (!version) return null;
  if (INSTALLER_NOISE.test(banner)) return null;
  if (res.code !== 0 && res.code !== null) return null;

  // Interpreters get a real smoke test: `--version` can succeed on a shim that
  // then downloads a runtime the first time it is asked to execute code.
  if (Array.isArray(tool.smokeArgs)) {
    const smoke = await spawnWithTimeout({
      cmd: bin,
      args: tool.smokeArgs,
      cwd: os.tmpdir(),
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    const output = `${smoke.stdout || ""}${smoke.stderr || ""}`;
    if (smoke.error || smoke.timedOut) return null;
    if (INSTALLER_NOISE.test(output)) return null;
    if (!output.includes(PROBE_MARKER)) return null;
  }
  return { bin, version };
}


function discoverLanguage(language) {
  const tool = TOOLCHAIN[language];
  if (!tool) return Promise.resolve({ available: false, bin: null, version: null, reason: "unsupported language" });
  if (!discovery.has(language)) {
    discovery.set(
      language,
      (async () => {
        for (const bin of tool.binaries()) {
          // eslint-disable-next-line no-await-in-loop
          const found = await probeBinary(bin, tool);

          if (found) return { available: true, bin: found.bin, version: found.version, reason: null };
        }
        return {
          available: false,
          bin: null,
          version: null,
          reason: `${tool.label} is not installed on this server`,
        };
      })()
    );
  }
  return discovery.get(language);
}

async function languageAvailable(language) {
  const info = await discoverLanguage(language);
  return info.available;
}

/** Boot-time warmup: discover every toolchain before the first student runs code. */
async function warmupRuntimes({ log = true } = {}) {
  const report = {};
  await Promise.all(
    Object.keys(TOOLCHAIN).map(async (language) => {
      const info = await discoverLanguage(language);
      report[language] = info;
      if (log) {
        const label = TOOLCHAIN[language].label;
        if (info.available) console.log(`[judge] ${label}: ready — ${info.version}`);
        else console.warn(`[judge] ${label}: not installed locally — runs fall back to the remote sandbox (install the toolchain for faster runs)`);
      }
    })
  );
  return report;
}

function missingRuntimeMessage(language) {
  const tool = TOOLCHAIN[language];
  const hint = {
    python: "install real Python 3 (python.org / apt install python3 / brew install python) — the Microsoft Store alias and the Python install manager shim are rejected on purpose — or set PYTHON_BIN to the interpreter path",
    c: "install gcc (apt install build-essential / MSYS2 mingw-w64 / brew install gcc) or set GCC_BIN",
    cpp: "install g++ (apt install build-essential / MSYS2 mingw-w64 / brew install gcc) or set GPP_BIN",
    java: "install a JDK (javac + java) or set JAVAC_BIN",
  }[language];
  return (
    `${tool ? tool.label : language} is not installed on this server — ${hint}. ` +
    `Run \`npm run setup:compilers\` in backend/ for guided installation. ` +
    `Runtimes are never installed on demand.`
  );
}


/**
 * Extra source files are attacker-controlled: keep them inside the temp dir,
 * allow only source extensions, and never overwrite the entry file.
 */
const EXTRA_FILE_LIMIT = 10;
const SAFE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.(java|c|cpp|cc|cxx|h|hpp|py)$/;

function sanitizeExtraFiles(files, entryFile) {
  if (!Array.isArray(files)) return [];
  const entry = String(entryFile || "").split(/[\\/]/).pop();
  const seen = new Set();
  const out = [];
  for (const file of files) {
    const name = String(file?.name || "").trim().split(/[\\/]/).pop();
    const content = String(file?.content ?? "");
    if (!name || !SAFE_NAME.test(name) || name === entry || seen.has(name)) continue;
    if (!content) continue;
    seen.add(name);
    out.push({ name, content });
    if (out.length >= EXTRA_FILE_LIMIT) break;
  }
  return out;
}

/**
 * Compiles (if needed) and runs one program against a single stdin payload.
 * Returns the same shape as the remote adapter in codeRunner.js.
 * `timeLimitMs` applies to the student's program only.
 */
async function executeLocally({ language, source, files = [], stdin = "", timeLimitMs = 3000, signal, session }) {
  const tool = TOOLCHAIN[language];
  if (!tool) {
    return {
      status: "invalid",
      stdout: "",
      stderr: "",
      compileOutput: "",
      timeMs: null,
      message: `Unsupported language: ${language}`,
    };
  }

  if (signal?.aborted) {
    return { status: "aborted", stdout: "", stderr: "", compileOutput: "", timeMs: null, message: "Stopped by the student" };
  }

  const info = await discoverLanguage(language);
  if (!info.available) {
    return {
      status: "judge_unavailable",
      stdout: "",
      stderr: "",
      compileOutput: "",
      timeMs: null,
      message: missingRuntimeMessage(language),
    };
  }

  const dir = session?.dir || await fs.mkdtemp(path.join(os.tmpdir(), "judge-"));
  if (session) session.dir = dir;
  let runDir = dir;
  try {
    const plan = typeof tool.plan === "function" ? tool.plan(source) : { file: tool.file };
    if (!session?.compiled) {
      const sourcePath = path.join(dir, plan.file);
      await fs.mkdir(path.dirname(sourcePath), { recursive: true });
      await fs.writeFile(sourcePath, String(source), "utf8");

      // Additional source files (e.g. helper classes next to Main.java).
      const extraPaths = [];
      for (const file of sanitizeExtraFiles(files, plan.file)) {
        const target = path.join(dir, file.name);
        // eslint-disable-next-line no-await-in-loop
        await fs.mkdir(path.dirname(target), { recursive: true });
        // eslint-disable-next-line no-await-in-loop
        await fs.writeFile(target, file.content, "utf8");
        extraPaths.push(target);
      }

      if (tool.compile) {
        const { cmd, args } = tool.compile(dir, info.bin, plan, extraPaths);
        const compiled = await spawnWithTimeout({ cmd, args, cwd: dir, timeoutMs: COMPILE_TIMEOUT_MS, signal });
        if (compiled.aborted) {
          return { status: "aborted", stdout: "", stderr: "", compileOutput: "", timeMs: null, message: "Stopped by the student" };
        }
        if (compiled.timedOut) {
          return {
            status: "compile_error",
            stdout: "",
            stderr: "",
            compileOutput: `Compilation timed out after ${COMPILE_TIMEOUT_MS} ms`,
            timeMs: null,
            message: null,
          };
        }
        if (compiled.error) {
          return {
            status: "judge_unavailable",
            stdout: "",
            stderr: "",
            compileOutput: "",
            timeMs: null,
            message: missingRuntimeMessage(language),
          };
        }
        if (compiled.code !== 0) {
          return {
            status: "compile_error",
            stdout: "",
            stderr: "",
            compileOutput: truncate(sanitizePaths(compiled.stderr || compiled.stdout || "Compilation failed", dir)),
            timeMs: null,
            message: null,
          };
        }
      }

      if (session) session.compiled = true;
    }

    if (session) {
      // Keep compiled artifacts immutable; each test still gets a fresh filesystem.
      runDir = await fs.mkdtemp(path.join(os.tmpdir(), "judge-run-"));
      await fs.cp(dir, runDir, { recursive: true });
    }
    const { cmd, args } = tool.run(runDir, info.bin, plan);
    const wrapped = withResourceLimits(language, cmd, args);
    const startedAt = Date.now(); // clock starts at the program, not at compile
    const run = await spawnWithTimeout({ cmd: wrapped.cmd, args: wrapped.args, cwd: runDir, stdin, timeoutMs: timeLimitMs, signal });
    const timeMs = Date.now() - startedAt;

    if (run.aborted) {
      return { status: "aborted", stdout: truncate(run.stdout), stderr: truncate(run.stderr), compileOutput: "", timeMs, message: "Stopped by the student" };
    }
    if (run.timedOut) {
      return {
        status: "time_limit_exceeded",
        stdout: truncate(run.stdout),
        stderr: truncate(run.stderr),
        compileOutput: "",
        timeMs,
        message: `Time limit exceeded (${timeLimitMs} ms). Check for an infinite loop or a program waiting for input that was never provided.`,
      };
    }
    if (run.error) {
      const notFound = run.error.code === "ENOENT";
      // EPERM/EACCES on a freshly compiled binary is the classic signature of
      // antivirus / Windows SmartScreen quarantining an unsigned temp .exe
      // (commonly surfaced to users as a confusing "<name>.exe" popup). Report
      // it as a clear, actionable judge_unavailable instead of a raw OS error.
      const blocked = run.error.code === "EPERM" || run.error.code === "EACCES";
      return {
        status: notFound || blocked ? "judge_unavailable" : "runtime_error",
        stdout: truncate(run.stdout),
        stderr: notFound || blocked ? "" : truncate(sanitizePaths(run.stderr, runDir)),
        compileOutput: "",
        timeMs,
        message: notFound
          ? missingRuntimeMessage(language)
          : blocked
            ? `The compiled program could not be started (${run.error.code}). This usually means antivirus or Windows SmartScreen ` +
              `blocked the freshly compiled executable in the temp folder. Add an exclusion for the OS temp directory ` +
              `(or run \`node scripts/check-runtimes.js\`) and try again.`
            : run.error.message,
      };
    }
    if (run.code !== 0) {
      return {
        status: "runtime_error",
        stdout: truncate(run.stdout),
        stderr: truncate(sanitizePaths(run.stderr, runDir)),
        compileOutput: "",
        timeMs,
        message: `Program exited with code ${run.code}`,
      };
    }
    return { status: "ok", stdout: truncate(run.stdout), stderr: truncate(sanitizePaths(run.stderr, runDir)), compileOutput: "", timeMs, message: null };
  } catch (err) {
    return { status: "judge_unavailable", stdout: "", stderr: "", compileOutput: "", timeMs: null, message: err.message };
  } finally {
    if (runDir !== dir) await fs.rm(runDir, { recursive: true, force: true }).catch(() => {});
    if (!session) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function disposeLocalSession(session) {
  if (session?.dir) await fs.rm(session.dir, { recursive: true, force: true }).catch(() => {});
}

module.exports = {
  disposeLocalSession,
  sanitizeExtraFiles,
  executeLocally,
  planJavaSource,
  languageAvailable,
  discoverLanguage,
  warmupRuntimes,
  missingRuntimeMessage,
  LOCAL_LANGUAGES: Object.keys(TOOLCHAIN),
};
