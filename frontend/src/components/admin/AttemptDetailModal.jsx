import { useEffect, useState } from "react";
import Badge from "../ui/Badge";
import Skeleton from "../ui/Skeleton";
import Modal from "../ui/Modal";
import { apiFetch, ApiError } from "../../lib/api";

/** One question's breakdown inside the "View attempt" modal. */
function QuestionDetailCard({ q, index }) {
  const stateTone = q.isCorrect ? "live" : q.isPartial ? "draft" : "danger";
  const stateLabel = q.isCorrect ? "Correct" : q.isPartial ? "Partial" : q.answered ? "Wrong" : "Unanswered";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-ink-100">
          <span className="mr-2 text-ink-600">Q{index + 1}.</span>
          {q.text}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={stateTone}>{stateLabel}</Badge>
          <span className="whitespace-nowrap text-xs text-ink-500">
            {q.marksAwarded ?? (q.isCorrect ? q.marks : 0)} / {q.marks} marks
          </span>
        </div>
      </div>

      {q.type === "mcq" && (
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-ink-600">Student's answer</p>
            <p className="mt-1 text-ink-200">{q.selectedOption || "— not answered —"}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-ink-600">Correct answer</p>
            <p className="mt-1 text-ink-200">{q.correctOption || "—"}</p>
          </div>
        </div>
      )}

      {q.type === "fill_blank" && (
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-ink-600">Student's answer</p>
            <p className="mt-1 whitespace-pre-wrap text-ink-200">
              {Array.isArray(q.submittedBlanks) && q.submittedBlanks.some((b) => String(b || "").trim())
                ? q.submittedBlanks.map((b, i) => `${i + 1}. ${b || "—"}`).join("\n")
                : "— not answered —"}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-ink-600">Correct answer</p>
            <p className="mt-1 whitespace-pre-wrap text-ink-200">
              {Array.isArray(q.correctBlanks) ? q.correctBlanks.map((b, i) => `${i + 1}. ${b}`).join("\n") : "—"}
            </p>
          </div>
        </div>
      )}

      {q.type === "coding" && (
        <div className="mt-3 space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {q.language && (
              <span className="inline-block rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-500">
                {q.language}
              </span>
            )}
            {q.judge?.status && (
              <span className="inline-block rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-500">
                Verdict: {q.judge.status}
                {q.judge.total ? ` — ${q.judge.passed ?? 0}/${q.judge.total} tests passed` : ""}
              </span>
            )}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-ink-600">Submitted code</p>
            <pre
              style={{ fontVariantLigatures: "none", fontFeatureSettings: '"liga" 0, "calt" 0' }}
              className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-ink-200"
            >
              {q.submittedCode || "— no code submitted —"}
            </pre>
          </div>

          {q.expectedOutput ? (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-ink-600">Expected output (correct answer)</p>
              <pre
                style={{ fontVariantLigatures: "none", fontFeatureSettings: '"liga" 0, "calt" 0' }}
                className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-[11px] leading-relaxed text-ink-200"
              >
                {q.expectedOutput}
              </pre>
            </div>
          ) : null}

          {Array.isArray(q.testCases) && q.testCases.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-ink-600">Test cases (input → expected output)</p>
              {q.testCases.map((t, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-white/10 bg-black/20 p-2.5 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] text-ink-600">{t.name || `Test ${i + 1}`} — input</p>
                    <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-ink-200">{t.input || "(none)"}</pre>
                  </div>
                  <div>
                    <p className="text-[10px] text-ink-600">Expected output</p>
                    <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-ink-200">
                      {t.expectedOutput || "(none)"}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {q.referenceSolution ? (
            <details className="rounded-lg border border-white/10 bg-black/20 p-2.5">
              <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-ink-600">
                Reference solution
              </summary>
              <pre
                style={{ fontVariantLigatures: "none", fontFeatureSettings: '"liga" 0, "calt" 0' }}
                className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink-200"
              >
                {q.referenceSolution}
              </pre>
            </details>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Shared "View attempt" modal: score summary, per-question breakdown, and
 * submitted code for coding questions. Used from both Results (Name/Register
 * search over final results) and Live Monitoring (Name/Register search over
 * in-progress activity) so admins see the same detail either way.
 */
export default function AttemptDetailModal({ attemptId, onClose, token, push }) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!attemptId) return;
    let alive = true;
    setLoading(true);
    setDetail(null);
    apiFetch(`/admin/results/${attemptId}`, { token })
      .then((data) => {
        if (alive) setDetail(data);
      })
      .catch((err) => {
        if (alive) push(err instanceof ApiError ? err.message : "Failed to load attempt detail", "error");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [attemptId, token, push]);

  const result = detail?.result;
  const questions = detail?.questionBreakdown || [];

  return (
    <Modal
      open={Boolean(attemptId)}
      onClose={onClose}
      maxWidth="max-w-3xl"
      title={result ? `${result.student?.name || "Student"} — attempt detail` : "Attempt detail"}
    >
      {loading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !detail ? (
        <p className="text-sm text-ink-500">Could not load this attempt.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-wide text-ink-600">Score</p>
              <p className="mt-1 font-display text-lg font-semibold text-ink-100">
                {result.obtainedMarks} / {result.totalMarks}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-wide text-ink-600">Percentage</p>
              <p className="mt-1 font-display text-lg font-semibold text-electric-light">{result.percentage}%</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-wide text-ink-600">Correct / Wrong / Unanswered</p>
              <p className="mt-1 text-sm text-ink-200">
                {result.correct} / {result.wrong} / {result.unanswered}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-wide text-ink-600">Status</p>
              <p className="mt-1">
                <Badge tone={result.passed ? "live" : "danger"}>{result.passed ? "Pass" : "Fail"}</Badge>
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Questions ({questions.length})
            </p>
            {questions.length === 0 ? (
              <p className="text-sm text-ink-500">No question breakdown available for this attempt.</p>
            ) : (
              questions.map((q, i) => <QuestionDetailCard key={q.questionId} q={q} index={i} />)
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
