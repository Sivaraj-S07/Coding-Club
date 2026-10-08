import TeamDashboardSection from "../../components/TeamDashboardSection";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  LogOut,
  AlertTriangle,
  X,
  Trophy,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ListChecks,
  Eye,
  Loader2,
  Terminal,
  Clock,
} from "lucide-react";
import Skeleton from "../../components/ui/Skeleton";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import DemoChip from "../../components/ui/DemoChip";
import { apiFetch, ApiError } from "../../lib/api";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";
import { useToast } from "../../components/ui/Toast";
import { DEMO_ENABLED, demoStudentResults, demoPlaygroundRuns, isDemoId } from "../../lib/demoData";
import LearningSnapshot from "../../components/ai/LearningSnapshot";

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

// The Dashboard shows a student's cumulative percentage across everything
// they've attended, the list of attended quizzes (with full drill-down into
// exactly what they submitted, including code), and their standalone
// Playground practice history — the two places a signed-in student's own
// activity is tracked. No username/register-number/navigation boxes here by
// design; that's what Profile is for.
export default function Dashboard() {
  const { token, signOut } = useStudentAccountAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState([]);
  const [cumulativePercentage, setCumulativePercentage] = useState(null);
  const [logoutEvent, setLogoutEvent] = useState(null);
  const [logoutEventDismissed, setLogoutEventDismissed] = useState(false);
  const [resultsAreDemo, setResultsAreDemo] = useState(false);
  const [runsAreDemo, setRunsAreDemo] = useState(false);

  const [activeAttemptId, setActiveAttemptId] = useState(null);
  const [attemptDetail, setAttemptDetail] = useState(null);
  const [attemptLoading, setAttemptLoading] = useState(false);

  // Standalone Playground ("Programming" tab) practice history — separate
  // from quiz coding questions above. The list endpoint already returns each
  // run's full source/stdin/output, so viewing one is just picking it out of
  // state — no extra request needed.
  const [playgroundRuns, setPlaygroundRuns] = useState([]);
  const [playgroundLoading, setPlaygroundLoading] = useState(true);
  const [activeRun, setActiveRun] = useState(null);

  useEffect(() => {
    let alive = true;
    apiFetch("/student/results", { token })
      .then((data) => {
        if (!alive) return;
        const list = Array.isArray(data.results) ? data.results : [];
        if (list.length === 0 && DEMO_ENABLED) {
          const demo = demoStudentResults();
          setResults(demo.results);
          setCumulativePercentage(demo.cumulativePercentage);
          setResultsAreDemo(true);
          return;
        }
        setResults(list);
        setCumulativePercentage(
          typeof data.cumulativePercentage === "number" ? data.cumulativePercentage : null
        );
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          signOut();
          navigate("/signin", { replace: true });
          return;
        }
        if (!alive) return;
        if (DEMO_ENABLED) {
          const demo = demoStudentResults();
          setResults(demo.results);
          setCumulativePercentage(demo.cumulativePercentage);
          setResultsAreDemo(true);
          return;
        }
        push(err instanceof ApiError ? err.message : "Failed to load your quizzes", "error");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    let alive = true;
    apiFetch("/playground/history", { token })
      .then((data) => {
        if (!alive) return;
        const list = Array.isArray(data.runs) ? data.runs : [];
        if (list.length === 0 && DEMO_ENABLED) {
          setPlaygroundRuns(demoPlaygroundRuns());
          setRunsAreDemo(true);
        } else {
          setPlaygroundRuns(list);
        }
      })
      .catch(() => {
        // Best-effort, same as the logout-event note below — an older
        // database without the migration just shows sample runs (or nothing).
        if (alive && DEMO_ENABLED) {
          setPlaygroundRuns(demoPlaygroundRuns());
          setRunsAreDemo(true);
        }
      })
      .finally(() => alive && setPlaygroundLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    // Best-effort — a most-recent-quiz-logout note.
    let alive = true;
    apiFetch("/students/account/logout-events", { token })
      .then((data) => {
        if (alive && Array.isArray(data.events) && data.events.length) setLogoutEvent(data.events[0]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);

  const handleSignOut = () => {
    signOut();
    navigate("/", { replace: true });
  };

  const openAttempt = (attemptId) => {
    if (isDemoId(attemptId)) {
      push("This is a sample attempt. Detailed answers appear for your real submissions.", "info");
      return;
    }
    setActiveAttemptId(attemptId);
    setAttemptDetail(null);
    setAttemptLoading(true);
    apiFetch(`/student/results/${attemptId}`, { token })
      .then((data) => setAttemptDetail(data))
      .catch((err) => {
        push(err instanceof ApiError ? err.message : "Failed to load your submitted data", "error");
        setActiveAttemptId(null);
      })
      .finally(() => setAttemptLoading(false));
  };

  const closeAttempt = () => {
    setActiveAttemptId(null);
    setAttemptDetail(null);
  };

  const cumulativeColor =
    cumulativePercentage === null
      ? "text-ink-500"
      : cumulativePercentage >= 60
        ? "text-mint"
        : cumulativePercentage >= 40
          ? "text-amber"
          : "text-coral";
  const circumference = 2 * Math.PI * 52;
  const ringPct = Math.min(100, Math.max(0, cumulativePercentage || 0));

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet to-electric shadow-glow">
            <LayoutDashboard className="h-5 w-5 text-void" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink-100">Your dashboard</h1>
            <p className="mt-1 text-sm text-ink-500">Every quiz you've attended, in one place.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-1.5 rounded-xl glass px-3.5 py-2 text-xs font-medium text-ink-500 transition-colors hover:text-coral"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>

      {!loading && logoutEvent && !logoutEventDismissed && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-coral/30 bg-coral/10 p-4 text-sm text-ink-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
          <div className="flex-1">
            <p className="font-medium">
              You were signed out of {logoutEvent.quizTitle ? `"${logoutEvent.quizTitle}"` : "a quiz"} during your
              last attempt.
            </p>
            <p className="mt-1 text-xs text-ink-500">{logoutEvent.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setLogoutEventDismissed(true)}
            className="shrink-0 text-ink-500 transition-colors hover:text-ink-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <TeamDashboardSection />
      <LearningSnapshot token={token} />

      {loading ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : (
        <>
          {/* Cumulative percentage across every attended quiz */}
          <div className="mt-8 glass-card flex flex-col items-center gap-6 p-6 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-5">
              <div className="relative h-24 w-24 shrink-0">
                <svg viewBox="0 0 120 120" className="h-24 w-24 -rotate-90">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                  {cumulativePercentage !== null && (
                    <circle
                      cx="60"
                      cy="60"
                      r="52"
                      fill="none"
                      stroke="currentColor"
                      className={cumulativeColor}
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - ringPct / 100)}
                      style={{ transition: "stroke-dashoffset 900ms ease" }}
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`font-display text-xl font-semibold ${cumulativeColor}`}>
                    {cumulativePercentage === null ? "—" : `${cumulativePercentage}%`}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-500">Cumulative percentage</p>
                <p className="mt-1 text-sm text-ink-500">
                  {results.length === 0
                    ? "Attend a quiz to see your score here."
                    : `Average across ${results.length} attended ${results.length === 1 ? "quiz" : "quizzes"}.`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <MiniStat
                label="Quizzes"
                value={results.length}
                icon={ListChecks}
                tone="text-electric-light"
              />
              <MiniStat
                label="Passed"
                value={results.filter((r) => r.passed).length}
                icon={CheckCircle2}
                tone="text-mint"
              />
              <MiniStat
                label="Not passed"
                value={results.filter((r) => !r.passed).length}
                icon={XCircle}
                tone="text-coral"
              />
            </div>
          </div>

          {/* Attended quizzes */}
          <h2 className="mt-10 flex flex-wrap items-center gap-3 font-display text-lg font-semibold text-ink-100">
            Attended quizzes {resultsAreDemo && <DemoChip />}
          </h2>

          {results.length === 0 ? (
            <div className="mt-4 glass-card p-8 text-center text-sm text-ink-500">
              You haven't attended any quizzes yet. Once you join and submit one, it'll show up here.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {results.map((r) => (
                <div
                  key={r.attemptId}
                  className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-display text-sm font-semibold text-ink-100">
                        {r.quizTitle || "Untitled quiz"}
                      </p>
                      <Badge tone={r.passed ? "live" : "danger"}>{r.passed ? "Passed" : "Not passed"}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-500">Submitted {formatDate(r.submittedAt)}</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-500">
                      <span>
                        {num(r.obtainedMarks)}/{num(r.totalMarks)} marks
                      </span>
                      <span>{Math.round(num(r.percentage))}%</span>
                      <span className="flex items-center gap-1 text-mint">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {num(r.correct)}
                      </span>
                      <span className="flex items-center gap-1 text-coral">
                        <XCircle className="h-3.5 w-3.5" /> {num(r.wrong)}
                      </span>
                      <span className="flex items-center gap-1 text-ink-500">
                        <MinusCircle className="h-3.5 w-3.5" /> {num(r.unanswered)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAttempt(r.attemptId)}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-electric/15 px-4 py-2.5 text-sm font-medium text-electric-light transition-colors hover:bg-electric/25"
                  >
                    <Eye className="h-4 w-4" /> View submission
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Programming practice — standalone Playground runs, separate from
              quiz coding questions above. */}
          <h2 className="mt-10 flex flex-wrap items-center gap-3 font-display text-lg font-semibold text-ink-100">
            Programming practice {runsAreDemo && <DemoChip />}
          </h2>
          {playgroundLoading ? (
            <Skeleton className="mt-4 h-24 rounded-2xl" />
          ) : playgroundRuns.length === 0 ? (
            <div className="mt-4 glass-card p-8 text-center text-sm text-ink-500">
              You haven't run anything in the Programming tab yet. Every run you make while signed in is saved here.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {playgroundRuns.map((r) => (
                <div
                  key={r.id}
                  className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-sm font-semibold text-ink-100">
                        {{ c: "C", cpp: "C++", java: "Java", python: "Python" }[r.language] || r.language}
                      </p>
                      <Badge tone={r.status === "ok" ? "live" : r.status === "time_limit_exceeded" ? "upcoming" : "danger"}>
                        {r.status === "ok" ? "Ran successfully" : r.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 flex items-center gap-3 text-xs text-ink-500">
                      <span>{formatDate(r.createdAt)}</span>
                      {typeof r.timeMs === "number" && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {r.timeMs} ms
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveRun(r)}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-electric/15 px-4 py-2.5 text-sm font-medium text-electric-light transition-colors hover:bg-electric/25"
                  >
                    <Eye className="h-4 w-4" /> View code
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Programming practice detail: exactly what was run, incl. code + output */}
      <Modal
        open={Boolean(activeRun)}
        title={
          activeRun
            ? `${{ c: "C", cpp: "C++", java: "Java", python: "Python" }[activeRun.language] || activeRun.language} run`
            : "Programming practice"
        }
        onClose={() => setActiveRun(null)}
        maxWidth="max-w-2xl"
      >
        {activeRun && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-center">
              <MiniStat
                label="Result"
                value={activeRun.status === "ok" ? "Ran successfully" : activeRun.status.replace(/_/g, " ")}
                icon={activeRun.status === "ok" ? CheckCircle2 : XCircle}
                tone={activeRun.status === "ok" ? "text-mint" : "text-coral"}
              />
              <MiniStat
                label="Time"
                value={typeof activeRun.timeMs === "number" ? `${activeRun.timeMs} ms` : "—"}
                icon={Clock}
                tone="text-electric-light"
              />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-600">Your code</p>
              <pre className="mt-1.5 max-h-60 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-ink-100">
                {activeRun.source}
              </pre>
            </div>
            {activeRun.stdin && (
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-600">Input</p>
                <pre className="mt-1.5 max-h-32 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-ink-100">
                  {activeRun.stdin}
                </pre>
              </div>
            )}
            {activeRun.stdout && (
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-600">Output</p>
                <pre className="mt-1.5 max-h-40 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-ink-100">
                  {activeRun.stdout}
                </pre>
              </div>
            )}
            {(activeRun.stderr || activeRun.compileOutput) && (
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-600">Errors</p>
                <pre className="mt-1.5 max-h-40 overflow-auto rounded-xl bg-coral/5 p-3 text-xs text-coral">
                  {activeRun.compileOutput || activeRun.stderr}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Attempt detail: exactly what the student saved/submitted, incl. code */}
      <Modal open={activeAttemptId !== null} title={attemptDetail?.attempt?.quizTitle || "Your submission"} onClose={closeAttempt} maxWidth="max-w-2xl">
        {attemptLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your submitted data...
          </div>
        ) : attemptDetail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <MiniStat
                label="Score"
                value={`${num(attemptDetail.attempt?.obtainedMarks)}/${num(attemptDetail.attempt?.totalMarks)}`}
                icon={Trophy}
                tone="text-amber"
              />
              <MiniStat
                label="Percentage"
                value={`${Math.round(num(attemptDetail.attempt?.percentage))}%`}
                icon={ListChecks}
                tone="text-electric-light"
              />
              <MiniStat
                label="Result"
                value={attemptDetail.attempt?.passed ? "Passed" : "Not passed"}
                icon={attemptDetail.attempt?.passed ? CheckCircle2 : XCircle}
                tone={attemptDetail.attempt?.passed ? "text-mint" : "text-coral"}
              />
            </div>

            <div className="space-y-3">
              {(attemptDetail.questions || []).map((q) => (
                <div key={q.questionId} className="glass-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink-100">Question {q.questionNumber}</p>
                    <Badge
                      tone={
                        q.outcome === "correct"
                          ? "live"
                          : q.outcome === "partial"
                            ? "violet"
                            : q.outcome === "unanswered"
                              ? "completed"
                              : "danger"
                      }
                    >
                      {q.outcome === "correct"
                        ? "Correct"
                        : q.outcome === "partial"
                          ? "Partially correct"
                          : q.outcome === "unanswered"
                            ? "Not answered"
                            : "Incorrect"}
                    </Badge>
                  </div>
                  {q.testsTotal ? (
                    <p className="mt-1 text-xs text-ink-500">
                      {q.testsPassed}/{q.testsTotal} test cases passed
                      {typeof q.marksAwarded === "number"
                        ? ` • ${q.marksAwarded} mark${q.marksAwarded === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  ) : null}
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-100">{q.question}</p>

                  {q.type === "coding" ? (
                    <div className="mt-3">
                      <p className="text-xs uppercase tracking-wide text-ink-600">
                        Your submitted code{q.language ? ` (${q.language})` : ""}
                      </p>
                      <pre className="mt-1.5 max-h-60 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-ink-100">
                        {q.yourCode || "Not answered"}
                      </pre>
                      {/* Only the hidden cases this attempt failed — hidden
                          cases it passed are never shown, even here. */}
                      {Array.isArray(q.hiddenCaseDetails) && q.hiddenCaseDetails.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs uppercase tracking-wide text-ink-600">Failed hidden test cases</p>
                          {q.hiddenCaseDetails.map((c, i) => (
                            <div key={i} className="rounded-lg border border-coral/20 bg-coral/5 p-2.5">
                              <p className="text-xs text-ink-200">{c.name}</p>
                              <div className="mt-1.5 grid gap-2 font-mono text-[11px] text-ink-300 sm:grid-cols-2">
                                <div>
                                  <p className="text-ink-600">Input</p>
                                  <pre className="whitespace-pre-wrap">{c.input}</pre>
                                </div>
                                <div>
                                  <p className="text-ink-600">Expected Output</p>
                                  <pre className="whitespace-pre-wrap">{c.expectedOutput}</pre>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="mt-3 text-sm text-ink-500">
                        <span className="text-ink-700">Your answer: </span>
                        <span className="whitespace-pre-wrap text-ink-100">{q.yourAnswer || "Not answered"}</span>
                      </p>
                      {q.outcome !== "correct" && (
                        <p className="mt-1 text-sm text-ink-500">
                          <span className="text-ink-700">Correct answer: </span>
                          <span className="whitespace-pre-wrap text-mint">{q.correctAnswer || "—"}</span>
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function MiniStat({ label, value, tone = "text-ink-100", icon: Icon }) {
  return (
    <div className="glass-card px-3 py-3 text-center">
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p className={`mt-1 font-display text-lg font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
