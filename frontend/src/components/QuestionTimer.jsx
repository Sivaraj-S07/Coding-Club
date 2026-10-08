import { Hourglass } from "lucide-react";

/**
 * Per-question countdown pill (independent of the overall quiz timer).
 * Purely presentational — the countdown itself is owned by QuizRunner so the
 * timer state stays in sync with question navigation and locking.
 */
function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function QuestionTimer({ secondsLeft, totalSeconds = 60, expired = false }) {
  const total = Math.max(1, Number(totalSeconds) || 1);
  const clamped = Math.max(0, Math.min(total, secondsLeft));
  const pct = (clamped / total) * 100;
  // Warning thresholds scale with the admin-configured limit.
  const criticalAt = Math.max(5, Math.round(total * 0.17));
  const warnAt = Math.max(10, Math.round(total * 0.34));
  const critical = expired || clamped <= criticalAt;
  const warn = !critical && clamped <= warnAt;

  const color = critical ? "text-coral" : warn ? "text-amber" : "text-electric-light";
  const bar = critical ? "bg-coral" : warn ? "bg-amber" : "bg-electric";

  return (
    <div className="w-full sm:w-56">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500">
          <Hourglass className={`h-3.5 w-3.5 ${color}`} strokeWidth={2.25} /> This question
        </span>
        <span className={`font-mono text-sm font-semibold tabular-nums ${color}`}>
          {expired ? "Time up" : formatClock(clamped)}
        </span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${bar} transition-all duration-300 ease-linear`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
