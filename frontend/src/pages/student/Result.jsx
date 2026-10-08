import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, XCircle, Trophy, ArrowLeft, MinusCircle, Clock } from "lucide-react";
import Skeleton from "../../components/ui/Skeleton";
import Button from "../../components/ui/Button";
import { apiFetch, ApiError } from "../../lib/api";
import { getStudentSession } from "../../lib/studentAuth";

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function Result() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const session = getStudentSession(quizId);

  // The runner hands the graded result over on submit, so the score renders
  // instantly — the fetch below is only a refresh / direct-visit fallback.
  const handedOver = location.state?.result || null;
  // Set when the attempt ended because the student missed a round's
  // qualification percentage — the scoreboard is final in that case.
  const finishedEarly = !!location.state?.finishedEarly;
  const roundOutcome = location.state?.roundOutcome || null;
  const finishedMessage = location.state?.message || "You have finished.";

  const [loading, setLoading] = useState(!handedOver);
  const [result, setResult] = useState(handedOver);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!session?.token) {
      if (!handedOver) {
        setError("No active session found for this quiz.");
        setLoading(false);
      }
      return;
    }
    apiFetch(`/quizzes/${quizId}/result`, { token: session.token })
      .then((data) => setResult((prev) => ({ ...(prev || {}), ...data.result })))
      .catch((err) => {
        if (handedOver) return; // already showing a valid score
        setError(err instanceof ApiError ? err.message : "Failed to load result");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  if (loading && !result) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-10">
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <p className="text-sm text-ink-500">{error || "Result not available yet."}</p>
        <Link to="/" className="mt-4 inline-flex items-center gap-1.5 text-sm text-electric-light hover:text-electric">
          <ArrowLeft className="h-4 w-4" /> Back to quizzes
        </Link>
      </div>
    );
  }

  const obtained = num(result.obtainedMarks);
  const total = num(result.totalMarks);
  const percentage = Math.round(num(result.percentage));
  const passed = !!result.passed;
  const ringColor = passed ? "#34d399" : "#f87171";
  const circumference = 2 * Math.PI * 52;

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 lg:px-8">
      {finishedEarly && (
        <div className="mb-5 rounded-2xl border border-coral/30 bg-coral/10 px-5 py-4 text-center">
          <p className="text-base font-semibold text-coral">{finishedMessage}</p>
          {roundOutcome && (
            <p className="mt-1 text-sm text-ink-300">
              You scored {roundOutcome.correct}/{roundOutcome.totalQuestions} (
              {Math.round(num(roundOutcome.percentage))}%) in {roundOutcome.roundName || "this round"} but{" "}
              {Math.round(num(roundOutcome.requiredPercentage))}% was required to qualify for the next round.
            </p>
          )}
          <p className="mt-1 text-xs text-ink-500">This is your final scoreboard.</p>
        </div>
      )}
      <div className="glass-panel p-8 text-center">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
            passed ? "bg-mint/10" : "bg-coral/10"
          }`}
        >
          {passed ? (
            <CheckCircle2 className="h-7 w-7 text-mint" />
          ) : (
            <XCircle className="h-7 w-7 text-coral" />
          )}
        </div>
        <h1 className="mt-4 font-display text-2xl font-semibold text-ink-100">
          {passed ? "You passed!" : "Quiz submitted"}
        </h1>
        {result.quizTitle && <p className="mt-1 text-sm text-ink-500">{result.quizTitle}</p>}

        {/* Final score — the headline of this page */}
        <div className="mt-7 flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-8">
          <div className="relative h-32 w-32 shrink-0">
            <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke={ringColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - Math.min(100, Math.max(0, percentage)) / 100)}
                style={{ transition: "stroke-dashoffset 900ms ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-3xl font-semibold text-ink-100">{percentage}%</span>
              <span className="text-[10px] uppercase tracking-wide text-ink-500">Score</span>
            </div>
          </div>

          <div className="text-center sm:text-left">
            <p className="text-xs uppercase tracking-wide text-ink-500">Final score</p>
            <p className="font-display text-4xl font-semibold text-ink-100">
              {obtained}
              <span className="text-2xl text-ink-500"> / {total}</span>
            </p>
            <p className="mt-1 text-sm text-ink-500">marks obtained</p>
            <span
              className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                passed ? "bg-mint/10 text-mint" : "bg-coral/10 text-coral"
              }`}
            >
              {passed ? "Passed" : "Not passed"}
            </span>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-3 gap-3">
          <Stat label="Correct" value={num(result.correct)} tone="text-mint" icon={CheckCircle2} />
          <Stat label="Wrong" value={num(result.wrong)} tone="text-coral" icon={XCircle} />
          <Stat label="Unanswered" value={num(result.unanswered)} tone="text-ink-100" icon={MinusCircle} />
        </div>

        {/* Rank and completion time — same ranking rules as the leaderboard:
            higher score first, earlier completion wins a tie. */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat
            label={result.totalParticipants ? `Rank (of ${result.totalParticipants})` : "Rank"}
            value={result.rank ? `#${result.rank}` : "—"}
            tone="text-amber"
            icon={Trophy}
          />
          <Stat
            label="Completion time"
            value={formatDuration(result.timeTakenSeconds)}
            tone="text-ink-100"
            icon={Clock}
          />
        </div>

        {Array.isArray(result.review) && result.review.length > 0 && (
          <div className="mt-8 text-left">
            <h2 className="font-display text-lg font-semibold text-ink-100">Answer review</h2>
            <p className="mt-1 text-xs text-ink-500">
              Correct answers for the questions you did not get right.
            </p>
            <div className="mt-4 space-y-3">
              {result.review.map((item) => (
                <div key={item.questionId} className="glass-card p-4">
                  <p className="text-sm font-semibold text-coral">
                    Question {item.questionNumber} —{" "}
                    {item.outcome === "partial" ? "Partially correct" : item.outcome === "unanswered" ? "Not answered" : "Incorrect"}
                  </p>
                  {item.testsTotal ? (
                    <p className="mt-1 text-xs text-ink-500">
                      {item.testsPassed}/{item.testsTotal} test cases passed
                      {item.judgeStatus === "hardcoded" ? " — hardcoded output rejected" : ""}
                      {typeof item.marksAwarded === "number" ? ` • ${item.marksAwarded} mark${item.marksAwarded === 1 ? "" : "s"}` : ""}
                    </p>
                  ) : null}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-100">{item.question}</p>
                  {item.type === "coding" ? (
                    <>
                      <p className="mt-3 text-xs uppercase tracking-wide text-ink-600">
                        Your submitted code{item.yourAnswer ? "" : " — not answered"}
                      </p>
                      {item.yourAnswer && (
                        <pre className="mt-1.5 max-h-48 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-ink-100">
                          {item.yourAnswer}
                        </pre>
                      )}
                      {/* Only the hidden cases this attempt failed are ever shown —
                          hidden cases it passed stay hidden. */}
                      {Array.isArray(item.hiddenCaseDetails) && item.hiddenCaseDetails.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs uppercase tracking-wide text-ink-600">Failed hidden test cases</p>
                          {item.hiddenCaseDetails.map((c, i) => (
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
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-sm text-ink-500">
                        <span className="text-ink-700">Your Answer: </span>
                        <span className="whitespace-pre-wrap text-coral">
                          {item.yourAnswer || "Not answered"}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-ink-500">
                        <span className="text-ink-700">Correct Answer: </span>
                        <span className="whitespace-pre-wrap text-mint">{item.correctAnswer || "—"}</span>
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="secondary" icon={Trophy} onClick={() => navigate(`/leaderboard/${quizId}`)}>
            View leaderboard
          </Button>
          <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate("/")}>
            Back to quizzes
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "text-ink-100", icon: Icon }) {
  return (
    <div className="glass-card p-4">
      <p className="flex items-center justify-center gap-1.5 text-xs text-ink-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p className={`mt-1 font-display text-xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
