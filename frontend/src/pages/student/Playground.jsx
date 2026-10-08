import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Loader2,
  RotateCcw,
  FolderTree,
  Save,
  Trash2,
  Plus,
  X,
  FileCode2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import CodeEditor from "../../components/student/CodeEditor";
import Console from "../../components/student/Console";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { apiFetch, ApiError } from "../../lib/api";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";

const LANGUAGES = [
  { id: "python", label: "Python", ext: ".py" },
  { id: "java", label: "Java", ext: ".java" },
  { id: "c", label: "C", ext: ".c" },
  { id: "cpp", label: "C++", ext: ".cpp" },
];

const EXT = Object.fromEntries(LANGUAGES.map((l) => [l.id, l.ext]));

const STARTERS = {
  python: `# Read input and print the result
name = input("Enter your name: ")
print("Hello,", name)
`,
  java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String name = sc.hasNextLine() ? sc.nextLine() : "world";
        System.out.println("Hello, " + name);
    }
}
`,
  c: `#include <stdio.h>

int main(void) {
    char name[100];
    if (scanf("%99s", name) == 1) printf("Hello, %s\\n", name);
    else printf("Hello, world\\n");
    return 0;
}
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    string name;
    if (!(cin >> name)) name = "world";
    cout << "Hello, " << name << "\\n";
    return 0;
}
`,
};

const STATUS_META = {
  ok: { label: "Success", tone: "text-emerald-300 bg-emerald-500/10" },
  compile_error: { label: "Compilation error", tone: "text-amber-300 bg-amber-500/10" },
  runtime_error: { label: "Runtime error", tone: "text-rose-300 bg-rose-500/10" },
  time_limit_exceeded: { label: "Time limit exceeded", tone: "text-amber-300 bg-amber-500/10" },
  judge_unavailable: { label: "Judge unavailable", tone: "text-rose-300 bg-rose-500/10" },
  invalid: { label: "Invalid request", tone: "text-rose-300 bg-rose-500/10" },
};

const STORAGE_KEY = "playground.state.v1";
const PROGRAMS_KEY = "playground.programs.v1";

const MAIN_TAB = "__main__";
const newId = () => `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** Programs live in the browser, grouped in one folder per language. */
function loadPrograms() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRAMS_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function withExtension(name, language) {
  const ext = EXT[language];
  const clean = String(name || "").trim().replace(/[\\/]+/g, "-");
  if (!clean) return "";
  return clean.toLowerCase().endsWith(ext) ? clean : `${clean.replace(/\.[^.]*$/, "")}${ext}`;
}

export default function Playground() {
  // Playground works fully signed-out; when a student IS signed in, sending
  // their token lets the backend attribute and save the run to their
  // Dashboard's "Programming practice" history (see optionalStudentAuth).
  const { token: accountToken, isAuthenticated } = useStudentAccountAuth();
  const [language, setLanguage] = useState("python");
  const [sources, setSources] = useState(STARTERS);
  // Extra Java files that compile alongside Main: [{ name, content }]
  const [extraFiles, setExtraFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(MAIN_TAB);
  const [stdin, setStdin] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [languageInfo, setLanguageInfo] = useState([]);

  const [programs, setPrograms] = useState([]);
  const [openProgramId, setOpenProgramId] = useState(null);
  const [showPrograms, setShowPrograms] = useState(true);
  const [collapsed, setCollapsed] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null);
  const [savedNotice, setSavedNotice] = useState("");
  const hydrated = useRef(false);
  const latestDraft = useRef(null);
  // Tracks the AbortController for whichever run is currently in flight, so
  // Clear can cancel it immediately instead of letting it finish in the
  // background and overwrite a console the student already cleared.
  const abortRef = useRef(null);

  // Restore the last session so a refresh never loses the student's work.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && saved.sources) {
        setSources({ ...STARTERS, ...saved.sources });
        if (saved.language) setLanguage(saved.language);
        if (typeof saved.stdin === "string") setStdin(saved.stdin);
        if (Array.isArray(saved.extraFiles)) setExtraFiles(saved.extraFiles);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setPrograms(loadPrograms());
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    latestDraft.current = { language, sources, stdin, extraFiles };
    const timer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(latestDraft.current)); }
      catch { /* storage may be full or disabled */ }
    }, 250);
    return () => clearTimeout(timer);
  }, [language, sources, stdin, extraFiles]);

  useEffect(() => {
    const flush = () => {
      if (!latestDraft.current) return;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(latestDraft.current)); }
      catch { /* storage may be full or disabled */ }
    };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, []);

  const persistPrograms = useCallback((next) => {
    setPrograms(next);
    try {
      localStorage.setItem(PROGRAMS_KEY, JSON.stringify(next));
    } catch {
      /* storage may be full or disabled */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    apiFetch("/playground/languages")
      .then((data) => alive && setLanguageInfo(data.languages || []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!savedNotice) return undefined;
    const timer = setTimeout(() => setSavedNotice(""), 2500);
    return () => clearTimeout(timer);
  }, [savedNotice]);

  useEffect(() => {
    if (language !== "java") setActiveFile(MAIN_TAB);
  }, [language]);

  // Never leave a program running in the background if the student navigates
  // away mid-run.
  useEffect(() => () => abortRef.current?.abort(), []);

  const source = sources[language] ?? "";
  const setSource = (value) => setSources((prev) => ({ ...prev, [language]: value }));

  const javaFiles = language === "java" ? extraFiles : [];
  const activeExtra = javaFiles.find((f) => f.name === activeFile) || null;
  const editorValue = activeExtra ? activeExtra.content : source;
  const setEditorValue = (value) => {
    if (activeExtra) {
      setExtraFiles((prev) => prev.map((f) => (f.name === activeExtra.name ? { ...f, content: value } : f)));
    } else {
      setSource(value);
    }
  };

  const info = useMemo(
    () => languageInfo.find((l) => l.id === language) || null,
    [languageInfo, language]
  );

  const grouped = useMemo(
    () =>
      LANGUAGES.map((l) => ({
        ...l,
        items: programs
          .filter((p) => p.language === l.id)
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
      })),
    [programs]
  );

  const addJavaFile = () => {
    const input = window.prompt("New Java file name (e.g. Helper.java)", "Helper.java");
    if (input === null) return;
    const name = withExtension(input, "java");
    if (!name) return;
    if (extraFiles.some((f) => f.name === name)) {
      setActiveFile(name);
      return;
    }
    const className = name.replace(/\.java$/i, "");
    setExtraFiles((prev) => [
      ...prev,
      { name, content: `public class ${className} {\n    \n}\n` },
    ]);
    setActiveFile(name);
  };

  const removeJavaFile = (name) => {
    setExtraFiles((prev) => prev.filter((f) => f.name !== name));
    setActiveFile((current) => (current === name ? MAIN_TAB : current));
  };

  const saveProgram = () => {
    const current = programs.find((p) => p.id === openProgramId);
    const suggested = current?.name || `program${EXT[language]}`;
    const input = window.prompt("Save program as", suggested);
    if (input === null) return;
    const name = withExtension(input, language);
    if (!name) return;

    const existing = programs.find(
      (p) => p.language === language && p.name.toLowerCase() === name.toLowerCase()
    );
    const record = {
      id: existing?.id || openProgramId || newId(),
      name,
      language,
      source,
      files: language === "java" ? extraFiles : [],
      stdin,
      updatedAt: Date.now(),
    };
    const next = programs.some((p) => p.id === record.id)
      ? programs.map((p) => (p.id === record.id ? record : p))
      : [...programs, record];
    persistPrograms(next);
    setOpenProgramId(record.id);
    setSavedNotice(`Saved ${name}`);
  };

  /** Ensure the suggested file name doesn't collide with an existing saved program. */
  const uniqueProgramName = (desired, forLanguage) => {
    const base = desired.replace(/\.[^.]*$/, "");
    let candidate = desired;
    let counter = 2;
    while (
      programs.some(
        (p) => p.language === forLanguage && p.name.toLowerCase() === candidate.toLowerCase()
      )
    ) {
      candidate = withExtension(`${base}-${counter}`, forLanguage);
      counter += 1;
    }
    return candidate;
  };

  /** "+ New File" — create, name and immediately open a brand-new saved program. */
  const createNewProgram = (forLanguage) => {
    const suggested = uniqueProgramName(`program${EXT[forLanguage]}`, forLanguage);
    const input = window.prompt(`New ${LANGUAGES.find((l) => l.id === forLanguage)?.label || forLanguage} file name`, suggested);
    if (input === null) return; // cancelled
    const requested = withExtension(input, forLanguage);
    if (!requested) return;
    const name = uniqueProgramName(requested, forLanguage);

    const record = {
      id: newId(),
      name,
      language: forLanguage,
      source: STARTERS[forLanguage] || "",
      files: [],
      stdin: "",
      updatedAt: Date.now(),
    };
    persistPrograms([...programs, record]);

    // Open it immediately: switch to its language, load its content, focus editor.
    setLanguage(forLanguage);
    setSources((prev) => ({ ...prev, [forLanguage]: record.source }));
    setExtraFiles([]);
    setActiveFile(MAIN_TAB);
    setStdin("");
    setOpenProgramId(record.id);
    setResult(null);
    setError("");
    setCollapsed((prev) => ({ ...prev, [forLanguage]: false }));
    setSavedNotice(`Created ${name}`);
  };

  const openProgram = (program) => {
    setLanguage(program.language);
    setSources((prev) => ({ ...prev, [program.language]: program.source }));
    setExtraFiles(program.language === "java" ? program.files || [] : []);
    setActiveFile(MAIN_TAB);
    if (typeof program.stdin === "string") setStdin(program.stdin);
    setOpenProgramId(program.id);
    setResult(null);
    setError("");
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    persistPrograms(programs.filter((p) => p.id !== pendingDelete.id));
    if (openProgramId === pendingDelete.id) setOpenProgramId(null);
    setPendingDelete(null);
  };

  const run = async () => {
    // A previous run somehow still in flight (shouldn't happen since the
    // button is disabled while running, but Clear leaves abortRef empty) —
    // cancel it first so only one program is ever executing at a time.
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunning(true);
    setError("");
    setResult(null);
    try {
      const data = await apiFetch("/playground/run", {
        method: "POST",
        body: { language, source, stdin, files: language === "java" ? extraFiles : [] },
        token: isAuthenticated ? accountToken : undefined,
        signal: controller.signal,
      });
      if (abortRef.current !== controller) return; // cancelled while awaiting — Clear already reset state
      setResult(data);
    } catch (err) {
      if (err?.name === "AbortError") return; // cancelled via Clear — nothing left to report
      setError(err instanceof ApiError ? err.message : "Failed to run your code. Please try again.");
    } finally {
      if (abortRef.current === controller) {
        setRunning(false);
        abortRef.current = null;
      }
    }
  };

  /**
   * Clear: if a program is currently running, stop it first (abort the
   * in-flight request, which also tells the backend to kill the compiled
   * program instead of letting it finish unattended), then reset the
   * console's input and output. Never leaves a run going in the background.
   */
  const clearConsole = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setRunning(false);
    setResult(null);
    setError("");
    setStdin("");
  };

  const meta = result ? STATUS_META[result.status] || STATUS_META.invalid : null;

  const transcript = useMemo(() => {
    if (!result) return "";
    const parts = [];
    if (result.compileOutput) parts.push(`$ compile\n${result.compileOutput}`);
    parts.push(`$ run (${language})`);
    if (result.stdout) parts.push(result.stdout.replace(/\n$/, ""));
    if (result.stderr) parts.push(result.stderr.replace(/\n$/, ""));
    if (result.message) parts.push(result.message);
    if (!result.stdout && !result.stderr && !result.message && !result.compileOutput) {
      parts.push("(no output)");
    }
    parts.push(
      `\n[exit status: ${meta?.label || result.status}${
        result.timeMs != null ? ` · ${result.timeMs} ms` : ""
      }]`
    );
    return parts.join("\n");
  }, [result, language, meta]);

  const openProgramName = programs.find((p) => p.id === openProgramId)?.name;

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-100">Programming</h1>
          <p className="mt-1 text-sm text-ink-500">
            Write, run and debug code in Python, Java, C or C++ — with your own input.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPrograms((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition-colors ${
              showPrograms ? "bg-white/10 text-ink-100" : "bg-white/5 text-ink-300 hover:text-ink-100"
            }`}
          >
            <FolderTree className="h-4 w-4" /> My Programs
          </button>
          <button
            type="button"
            onClick={() => createNewProgram(language)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-sm text-ink-300 transition-colors hover:text-ink-100"
          >
            <Plus className="h-4 w-4" /> New File
          </button>
          <label htmlFor="pg-language" className="text-xs text-ink-500">
            Language
          </label>
          <select
            id="pg-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded-xl border hairline bg-white/5 px-3 py-2 text-sm text-ink-100 focus:outline-none focus:ring-2 focus:ring-electric/40"
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id} className="bg-void text-ink-100">
                {l.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={saveProgram}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-sm text-ink-300 transition-colors hover:text-ink-100"
          >
            <Save className="h-4 w-4" /> Save
          </button>
          <button
            type="button"
            onClick={() => {
              setSources((prev) => ({ ...prev, [language]: STARTERS[language] }));
              if (language === "java") setExtraFiles([]);
              setActiveFile(MAIN_TAB);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-sm text-ink-300 transition-colors hover:text-ink-100"
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
          <button
            type="button"
            onClick={run}
            disabled={running || !source.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-electric/20 px-4 py-2 text-sm font-medium text-electric-light transition-colors hover:bg-electric/30 disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Running…" : "Run Code"}
          </button>
        </div>
      </div>

      {savedNotice && (
        <p className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300">{savedNotice}</p>
      )}

      {info && !info.localToolchain && (
        <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
          {info.label} has no compiler installed on this server — runs are forwarded to the remote
          sandbox and may be slower. Install the toolchain (or set CODE_EXEC_URL) for instant runs.
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-9">
        {showPrograms && (
          <aside className="lg:col-span-2">
            <div className="glass-card overflow-hidden p-0">
              <div className="flex items-center justify-between border-b hairline px-4 py-2.5 text-xs text-ink-500">
                <span>My Programs</span>
                <span>{programs.length}</span>
              </div>
              <div className="max-h-[520px] overflow-auto p-2">
                {grouped.map((folder) => {
                  const isCollapsed = collapsed[folder.id];
                  return (
                    <div key={folder.id} className="mb-1">
                      <div className="group flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setCollapsed((prev) => ({ ...prev, [folder.id]: !prev[folder.id] }))}
                          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm text-ink-200 transition-colors hover:bg-white/5"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-3.5 w-3.5 text-ink-500" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-ink-500" />
                          )}
                          <FolderTree className="h-4 w-4 text-ink-500" />
                          {folder.label}
                          <span className="ml-auto text-[11px] text-ink-500">{folder.items.length}</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`New ${folder.label} file`}
                          title={`New ${folder.label} file`}
                          onClick={() => createNewProgram(folder.id)}
                          className="rounded-lg p-1.5 text-ink-500 transition-colors hover:text-ink-100"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {!isCollapsed && (
                        <ul className="ml-4 border-l hairline pl-2">
                          {folder.items.length === 0 && (
                            <li className="px-2 py-1.5 text-[11px] text-ink-500">No saved programs</li>
                          )}
                          {folder.items.map((program) => (
                            <li key={program.id} className="group flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openProgram(program)}
                                className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/5 ${
                                  openProgramId === program.id ? "text-electric-light" : "text-ink-300"
                                }`}
                              >
                                <FileCode2 className="h-3.5 w-3.5 shrink-0 text-ink-500" />
                                <span className="truncate">{program.name}</span>
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete ${program.name}`}
                                onClick={() => setPendingDelete(program)}
                                className="rounded-lg p-1.5 text-ink-500 transition-colors hover:text-rose-300"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        )}

        <div className={showPrograms ? "space-y-4 lg:col-span-7" : "space-y-4 lg:col-span-9"}>
          <div className="glass-card overflow-hidden p-0">
            <div className="flex items-center justify-between border-b hairline px-4 py-2.5 text-xs text-ink-500">
              <span className="truncate">{openProgramName ? `Editor · ${openProgramName}` : "Editor"}</span>
              <span>{info?.version || LANGUAGES.find((l) => l.id === language)?.label}</span>
            </div>

            {language === "java" && (
              <div className="flex flex-wrap items-center gap-1 border-b hairline px-3 py-2">
                <button
                  type="button"
                  onClick={() => setActiveFile(MAIN_TAB)}
                  className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                    activeFile === MAIN_TAB ? "bg-white/10 text-ink-100" : "text-ink-500 hover:text-ink-100"
                  }`}
                >
                  Main.java
                </button>
                {extraFiles.map((file) => (
                  <span
                    key={file.name}
                    className={`inline-flex items-center rounded-lg text-xs ${
                      activeFile === file.name ? "bg-white/10 text-ink-100" : "text-ink-500"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveFile(file.name)}
                      className="px-2.5 py-1 transition-colors hover:text-ink-100"
                    >
                      {file.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => removeJavaFile(file.name)}
                      className="pr-2 transition-colors hover:text-rose-300"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={addJavaFile}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-ink-500 transition-colors hover:text-ink-100"
                >
                  <Plus className="h-3.5 w-3.5" /> Add class
                </button>
              </div>
            )}

            {/* Large, half-screen-style editor — scrolls internally for long
                programs, with a full-screen toggle for even more room. */}
            <div className="p-3">
              <CodeEditor
                value={editorValue}
                onChange={setEditorValue}
                disabled={running}
                height="70vh"
                minHeight="460px"
              />
            </div>
          </div>

          {/* Compiler-style console: type input directly here, then Run
              right from the console footer — no tab switching. */}
          <Console
            transcript={running ? "Running your program…" : error || transcript}
            running={running}
            stdin={stdin}
            onStdinChange={setStdin}
            onClearOutput={clearConsole}
            statusBadge={meta ? <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.tone}`}>{meta.label}</span> : null}
            outputPlaceholder="Press Run Code to execute your program. Output appears here."
            actions={
              <button
                type="button"
                onClick={run}
                disabled={running || !source.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-electric/20 px-4 py-2 text-sm font-medium text-electric-light transition-colors hover:bg-electric/30 disabled:opacity-50"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {running ? "Running…" : "Run Code"}
              </button>
            }
          />
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete program"
        description={`Delete "${pendingDelete?.name || ""}" from My Programs? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
