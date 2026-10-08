import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Send, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import CodeEditor from "./CodeEditor";
import Console from "./Console";
import Button from "../ui/Button";
import { apiFetch, ApiError } from "../../lib/api";

const LANGUAGE_LABELS = { c: "C", cpp: "C++", java: "Java", python: "Python" };

function Section({ title, children }) {
  if (!children) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{title}</p>
      <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-200">{children}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    ok: { label: "Accepted", cls: "border-mint/30 bg-mint/10 text-mint", Icon: CheckCircle2 },
    wrong_answer: { label: "Wrong answer", cls: "border-coral/30 bg-coral/10 text-coral", Icon: XCircle },
    compile_error: { label: "Compilation error", cls: "border-coral/30 bg-coral/10 text-coral", Icon: AlertTriangle },
    runtime_error: { label: "Runtime error", cls: "border-coral/30 bg-coral/10 text-coral", Icon: AlertTriangle },
    time_limit_exceeded: { label: "Time limit exceeded", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300", Icon: Clock },
    hardcoded: { label: "Hardcoded output rejected", cls: "border-coral/30 bg-coral/10 text-coral", Icon: AlertTriangle },
    judge_unavailable: { label: "Judge unavailable", cls: "border-white/15 bg-white/5 text-ink-300", Icon: AlertTriangle },
    no_tests: { label: "No test cases", cls: "border-white/15 bg-white/5 text-ink-300", Icon: AlertTriangle },
  };
  const { label, cls, Icon } = map[status] || map.judge_unavailable;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
  );
}

/**
 * LeetCode / HackerRank style workspace for a programming question:
 * problem statement + constraints + sample I/O on one side, a large editor
 * with a compiler-style console (stdin box + output, no tab switching) and
 * Run (samples only) / Submit (hidden test cases, graded server-side).
 */
export default function CodingWorkspace({
  question,
  quizId,
  token,
  value,
  onChange,
  disabled,
  onSubmitted,
  push,
  fullscreenTopOffset,
}) {
  const languages = useMemo(() => {
    const list = Array.isArray(question.languages) && question.languages.length
      ? question.languages
      : question.language
        ? [question.language]
        : ["python"];
    return list;
  }, [question]);

  const [language, setLanguage] = useState(languages[0]);
  const [customInput, setCustomInput] = useState("");
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [output, setOutput] = useState(null);
  const [terminal, setTerminal] = useState("");
  const [verdict, setVerdict] = useState(question.judge || null);
  // Tracks whichever of Run/Submit is currently in flight, so Clear can stop
  // it immediately instead of letting it finish in the background.
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const samples = Array.isArray(question.sampleIo) ? question.sampleIo : [];
  const code = value ?? question.starterCode ?? "";

  const call = async (path, body, signal) => {
    return apiFetch(`/quizzes/${quizId}/${path}`, { method: "POST", token, body, signal });
  };

  // Execution problems belong in the terminal, not only in a toast that
  // disappears — the student needs to read the compiler/judge message.
  const handleError = (err, label) => {
    const message =
      err instanceof ApiError
        ? err.message || "Execution failed"
        : "Could not reach the code judge. Check your connection and try again.";
    setTerminal(`$ ${label}\n${message}\n\n[failed]`);
    push(message, "error");
  };

  const handleRun = async () => {
    if (!code.trim()) return push("Write some code first.", "warning");
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunning(true);
    setOutput(null);
    setTerminal(`$ running your ${LANGUAGE_LABELS[language] || language} program…`);
    try {
      // Only send stdin when the console's input box actually has content —
      // matches the original behavior where Run auto-grades against the
      // sample cases when no custom input is given, and only switches to a
      // single stdin-driven execution when the student has typed something.
      const res = await call(
        "code/run",
        {
          questionId: question.id,
          code,
          language,
          ...(customInput.length > 0 ? { stdin: customInput } : {}),
        },
        controller.signal
      );
      if (abortRef.current !== controller) return; // cancelled via Clear while awaiting
      setOutput(res);
      setTerminal(res.terminal || res.run?.stdout || res.run?.message || "(no output)");
    } catch (err) {
      if (err?.name === "AbortError") return; // cancelled via Clear — nothing left to report
      handleError(err, "run");
    } finally {
      if (abortRef.current === controller) {
        setRunning(false);
        abortRef.current = null;
      }
    }
  };

  const handleSubmit = async () => {
    if (!code.trim()) return push("Write some code first.", "warning");
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSubmitting(true);
    setTerminal("$ compiling and validating your submission…");
    try {
      const res = await call("code/submit", { questionId: question.id, code, language }, controller.signal);
      if (abortRef.current !== controller) return;
      setVerdict(res.judge);
      setOutput({ mode: "submit", results: res.results, run: res.run, ...res.judge });
      setTerminal(res.terminal || res.run?.stdout || "(no output)");
      if (res.judge?.status === "ok") {
        push(
          res.judge.total
            ? `Submitted — all ${res.judge.total} test cases passed.`
            : "Submitted — your code compiled and ran successfully.",
          "success"
        );
      } else if (res.judge?.status === "hardcoded") {
        push("Submission rejected: the output appears to be hardcoded.", "error");
      } else if (res.judge?.total) {
        push(`Submitted — ${res.judge?.passed ?? 0}/${res.judge?.total ?? 0} test cases passed.`, "warning");
      } else {
        push("Submitted — see the console for the execution result.", "warning");
      }
      if (onSubmitted) onSubmitted(code);
    } catch (err) {
      if (err?.name === "AbortError") return; // cancelled via Clear
      handleError(err, "submit");
    } finally {
      if (abortRef.current === controller) {
        setSubmitting(false);
        abortRef.current = null;
      }
    }
  };

  /**
   * Clear: if a program is currently running (Run or Submit), stop it first
   * — aborting the in-flight request also tells the backend to kill the
   * compiled program rather than let it finish unattended — then clear the
   * console's input and output. Never leaves a program running in the
   * background.
   */
  const handleClear = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setRunning(false);
    setSubmitting(false);
    setOutput(null);
    setTerminal("");
    setCustomInput("");
  };

  return (
    <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Problem panel */}
      <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <Section title="Problem">{question.problemStatement || null}</Section>
        <Section title="Input format">{question.inputFormat || null}</Section>
        <Section title="Output format">{question.outputFormat || null}</Section>
        <Section title="Constraints">{question.constraintsText || null}</Section>

        {samples.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Sample input / output</p>
            {samples.map((s, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-black/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-ink-600">Sample {i + 1}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] uppercase text-ink-600">Input</p>
                    <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-ink-200">{s.input}</pre>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-ink-600">Output</p>
                    <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-ink-200">{s.output}</pre>
                  </div>
                </div>
                {s.explanation ? (
                  <p className="mt-2 text-xs text-ink-400">
                    <span className="text-ink-600">Explanation: </span>
                    {s.explanation}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-[11px] text-ink-600">
          <span className="rounded-full border border-white/10 px-2 py-1">
            Time limit {(Number(question.timeLimitMs || 3000) / 1000).toFixed(1)}s
          </span>
          {question.testCaseCount > 0 && (
            <span className="rounded-full border border-white/10 px-2 py-1">
              {question.testCaseCount} test case{question.testCaseCount === 1 ? "" : "s"} (hidden)
            </span>
          )}
        </div>
      </div>

      {/* Editor panel */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={disabled || languages.length === 1}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-ink-100 outline-none focus:border-electric/40"
          >
            {languages.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABELS[l] || l}
              </option>
            ))}
          </select>
          {verdict && <StatusPill status={verdict.status} />}
        </div>

        {/* Large, half-screen-style editor — scrolls internally for long
            programs, with a full-screen toggle for even more room. */}
        <CodeEditor
          value={code}
          onChange={(next) => onChange(next)}
          disabled={disabled}
          height="70vh"
          minHeight="460px"
          placeholder={`Write your ${LANGUAGE_LABELS[language] || language} solution here. Read input from standard input.`}
          fullscreenTopOffset={fullscreenTopOffset}
        />

        {/* Compiler-style console: type input directly here, then Run or
            Submit right from the console footer. */}
        <Console
          transcript={terminal}
          running={running || submitting}
          stdin={customInput}
          onStdinChange={setCustomInput}
          onClearOutput={handleClear}
          disabled={disabled}
          statusBadge={!running && !submitting && output?.status ? <StatusPill status={output.status} /> : null}
          outputPlaceholder="Press Run to execute your code against the sample cases, or Submit to grade it."
          actions={
            <>
              <Button variant="ghost" onClick={handleRun} disabled={disabled || running || submitting}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run
              </Button>
              <Button onClick={handleSubmit} disabled={disabled || running || submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit
              </Button>
            </>
          }
        />

        {Array.isArray(output?.results) && output.results.length > 0 && (
          <div className="space-y-2">
            {output.results.map((r, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                <div className="flex items-center gap-2 text-xs">
                  {r.passed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-mint" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-coral" />
                  )}
                  <span className="text-ink-200">{r.name}</span>
                  <span className="ml-auto text-ink-600">{r.status}</span>
                </div>
                {/* Sample cases are always fully visible. Hidden cases stay
                    hidden unless this submission failed them — then only
                    Input/Expected are revealed (never the actual output),
                    so a hidden case the student passed reveals nothing. */}
                {(!r.hidden || r.input != null) && (
                  <div className="mt-2 grid gap-2 font-mono text-[11px] text-ink-300 sm:grid-cols-3">
                    <div>
                      <p className="text-ink-600">Input</p>
                      <pre className="whitespace-pre-wrap">{r.input}</pre>
                    </div>
                    <div>
                      <p className="text-ink-600">Expected</p>
                      <pre className="whitespace-pre-wrap">{r.expectedOutput}</pre>
                    </div>
                    {!r.hidden && (
                      <div>
                        <p className="text-ink-600">Your output</p>
                        <pre className="whitespace-pre-wrap">
                          {r.actualOutput || r.stdout || r.stderr || "(empty)"}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
                {r.hidden && r.input != null && (
                  <p className="mt-1 text-[11px] text-coral">Hidden test case — shown because it failed.</p>
                )}
                {r.hidden && r.message ? <p className="mt-1 text-[11px] text-ink-500">{r.message}</p> : null}
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-ink-700">
          Run tests your code against the sample cases only. Submit grades it against all hidden test cases — your
          latest submission is the one that counts.
        </p>
      </div>
    </div>
  );
}
