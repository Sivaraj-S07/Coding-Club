import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  MonitorX,
  RefreshCcw,
  Timer as TimerIcon,
  ListChecks,
  Send,
  WifiOff,
  Loader2,
  EyeOff,
  BookOpenCheck,
  Rocket,
} from "lucide-react";
import Button from "./ui/Button";
import { useNetworkStabilityCheck } from "../hooks/useNetworkQuality";

const COUNTDOWN_SECONDS = 30;

// Static, frontend-only instruction content — no database / API involved.
const SLIDES = [
  {
    icon: BookOpenCheck,
    title: "Before you begin",
    body: "Read every slide carefully. These rules apply for the entire quiz and are enforced automatically by the system.",
  },
  {
    icon: MonitorX,
    title: "Do not switch tabs",
    body: "Switching browser tabs or minimising the window is recorded as a violation. Repeated tab switches can auto-submit your quiz.",
  },
  {
    icon: EyeOff,
    title: "Stay on the quiz screen",
    body: "Do not open other applications, screenshots tools, or split-screen windows while the quiz is running.",
  },
  {
    icon: RefreshCcw,
    title: "Do not refresh or go back",
    body: "Refreshing, closing the tab, or pressing the browser back button may end your attempt. Your timer keeps running regardless.",
  },
  {
    icon: TimerIcon,
    title: "Respect the time limit",
    body: "The quiz has a fixed overall duration shown at the top of the screen. Individual questions may also carry their own time limit set by your organiser — when the countdown for such a question runs out, the quiz moves to the next question automatically and that question can no longer be answered.",
  },
  {
    icon: ListChecks,
    title: "Answer at your own pace",
    body: "Use the question palette to track answered and unanswered questions. Every answer is saved as soon as you select or type it.",
  },
  {
    icon: WifiOff,
    title: "Keep a stable connection",
    body: "Use a reliable internet connection. If the network drops briefly, stay on the page — do not reload; answers resync automatically.",
  },
  {
    icon: ShieldCheck,
    title: "No unfair means",
    body: "Any external help, copied content, or shared credentials can invalidate your attempt. Attempt the quiz honestly and independently.",
  },
  {
    icon: Send,
    title: "Submit properly",
    body: "Finish by clicking Submit quiz and confirming. Do not just close the tab — an unsubmitted attempt may not be evaluated correctly.",
  },
  {
    icon: Rocket,
    title: "You're all set",
    body: "Once the countdown finishes and you've viewed every slide, the Start Quiz button unlocks. Good luck!",
  },
];

export default function QuizInstructions({ quizTitle, onStart }) {
  const [index, setIndex] = useState(0);
  const [maxSeen, setMaxSeen] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSecondsLeft(Math.max(0, COUNTDOWN_SECONDS - elapsed));
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Network Quality Protection — a quick, one-round-trip connection check
  // runs silently in the background while the student reads the
  // instructions. It never holds up "Start Quiz" by itself: students can
  // read the slides and start the moment the other gates are satisfied.
  // The only thing this check can do is *block* — and only when it finds a
  // critical problem (server genuinely unreachable, e.g. the device is
  // offline), since starting the quiz in that state would just fail anyway.
  // A merely slow or momentarily-checking connection is never a reason to
  // wait.
  const { checking: networkChecking, status: networkStatus, runCheck: runNetworkCheck } = useNetworkStabilityCheck();
  useEffect(() => {
    runNetworkCheck();
  }, [runNetworkCheck]);
  const networkCritical = networkStatus === "critical";

  // If a critical outage is detected, keep quietly retrying in the
  // background so the gate lifts on its own the moment the connection
  // comes back — the student shouldn't have to notice and click retry.
  useEffect(() => {
    if (!networkCritical) return undefined;
    const id = setInterval(() => {
      runNetworkCheck();
    }, 5000);
    return () => clearInterval(id);
  }, [networkCritical, runNetworkCheck]);

  const total = SLIDES.length;
  const allSeen = maxSeen >= total - 1;
  const timeDone = secondsLeft <= 0;
  const canStart = allSeen && timeDone && !networkCritical;

  const goNext = () => {
    setIndex((i) => {
      const next = Math.min(total - 1, i + 1);
      setMaxSeen((m) => Math.max(m, next));
      return next;
    });
  };
  const goPrev = () => setIndex((i) => Math.max(0, i - 1));

  const slide = SLIDES[index];
  const Icon = slide.icon;
  const progress = useMemo(() => ((COUNTDOWN_SECONDS - secondsLeft) / COUNTDOWN_SECONDS) * 100, [secondsLeft]);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5 py-10">
      <div className="glass-card p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Instructions</p>
            {quizTitle && <p className="truncate text-sm text-ink-300">{quizTitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {networkCritical && (
              <div
                className="flex items-center gap-1.5 rounded-full border border-coral/30 bg-coral/10 px-3 py-1.5 text-coral"
                title="No connection to the server was detected"
              >
                <WifiOff className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">No connection</span>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
              <TimerIcon className="h-4 w-4 text-electric" />
              <span className="text-sm font-semibold tabular-nums text-ink-100">
                {timeDone ? "Ready" : `${secondsLeft}s`}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-electric transition-all duration-300 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div key={index} className="mt-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-electric/30 bg-electric/10">
            <Icon className="h-7 w-7 text-electric" strokeWidth={2} />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-ink-100">{slide.title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-300">{slide.body}</p>
        </div>

        <div className="mt-8 flex items-center justify-center gap-1.5">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === index ? "w-6 bg-electric" : i <= maxSeen ? "w-1.5 bg-electric/40" : "w-1.5 bg-white/15"
              }`}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={index === 0} onClick={goPrev}>
            Previous
          </Button>
          <p className="text-xs text-ink-500">
            Slide {index + 1} of {total}
          </p>
          {index < total - 1 ? (
            <Button size="sm" onClick={goNext}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={onStart} disabled={!canStart}>
              Start Quiz
            </Button>
          )}
        </div>

        {!canStart && (
          <div className="mt-4 text-center text-xs text-ink-500">
            <p>
              {!allSeen
                ? "View all instruction slides to unlock the Start Quiz button."
                : !timeDone
                  ? `Please wait ${secondsLeft}s before starting.`
                  : "We couldn't reach the server — check your internet connection and try again."}
            </p>
            {allSeen && timeDone && networkCritical && (
              <button
                type="button"
                onClick={() => runNetworkCheck()}
                disabled={networkChecking}
                className="mt-2 inline-flex items-center gap-1.5 font-medium text-electric underline underline-offset-2 disabled:opacity-60"
              >
                {networkChecking && <Loader2 className="h-3 w-3 animate-spin" />}
                Retry connection check
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
