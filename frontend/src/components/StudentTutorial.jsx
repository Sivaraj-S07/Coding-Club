import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ListChecks,
  KeyRound,
  ShieldCheck,
  Timer as TimerIcon,
  Hourglass,
  LayoutGrid,
  Send,
  Trophy,
  Rocket,
  Loader2,
} from "lucide-react";
import Button from "./ui/Button";

export const TUTORIAL_STORAGE_KEY = "quizapp_student_tutorial_done_v1";

export function hasSeenStudentTutorial() {
  try {
    return localStorage.getItem(TUTORIAL_STORAGE_KEY) === "1";
  } catch {
    return true; // storage blocked — never block the page
  }
}

export function markStudentTutorialSeen() {
  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, "1");
  } catch {
    // storage unavailable — continue anyway
  }
}

// 10 slides — one important Student Page feature each.
const SLIDES = [
  {
    icon: Sparkles,
    title: "Welcome to the Eduverse",
    body: "This is your student page. Everything you need to join a quiz, track your time and check your rank lives here. Let's take a quick 10-step tour.",
  },
  {
    icon: ListChecks,
    title: "Available quizzes",
    body: "All published quizzes appear as cards. Each card shows the quiz title, a short description and its current status — upcoming, live or completed.",
  },
  {
    icon: LayoutGrid,
    title: "Read the quiz details",
    body: "Every card lists the number of questions, the total duration in minutes and how many students have already participated, so you know what to expect.",
  },
  {
    icon: KeyRound,
    title: "Joining a quiz",
    body: "Tap “Join quiz” on a live quiz and enter your details along with the access code shared by your coordinator to start your attempt.",
  },
  {
    icon: ShieldCheck,
    title: "Instructions & fair play",
    body: "Before the quiz begins you'll see the rules screen. Stay on the quiz tab — switching tabs is recorded and repeated violations can auto-submit your attempt.",
  },
  {
    icon: TimerIcon,
    title: "Overall quiz timer",
    body: "A countdown at the top of the quiz shows the time left for the whole quiz. When it reaches zero, your answers are submitted automatically.",
  },
  {
    icon: Hourglass,
    title: "Per-question time limits",
    body: "Some questions carry their own countdown, set by your organiser. Answer and press Next any time — when a question\'s timer runs out the quiz moves on by itself.",
  },
  {
    icon: LayoutGrid,
    title: "Question palette",
    body: "The palette on the side shows which questions are answered, which are pending and where you are right now. Tap any number to jump to it.",
  },
  {
    icon: Send,
    title: "Submitting your answers",
    body: "Answers save automatically as you pick or type them. Finish with “Submit quiz” and confirm — never just close the tab.",
  },
  {
    icon: Trophy,
    title: "Results & leaderboard",
    body: "Right after submitting you'll see your score, and the leaderboard shows how you rank against your peers. That's it — you're ready to go!",
  },
];

/**
 * First-visit interactive tutorial overlay for the Student Page.
 * - Next-only navigation (plus Back); there is no Skip option.
 * - Stays visible while `dataLoading` is true, so data loading finishes behind it.
 * - Completion is stored in localStorage so it shows only once.
 */
export default function StudentTutorial({ dataLoading = false, onFinish }) {
  const [index, setIndex] = useState(0);
  const total = SLIDES.length;
  const isLast = index === total - 1;

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(total - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  // Lock background scroll while the overlay is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const goNext = () => setIndex((i) => Math.min(total - 1, i + 1));
  const goPrev = () => setIndex((i) => Math.max(0, i - 1));

  const finish = () => {
    markStudentTutorialSeen();
    onFinish?.();
  };

  const slide = SLIDES[index];
  const Icon = slide.icon;
  const progress = ((index + 1) / total) * 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Student page tutorial"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-void/85 px-4 py-8 backdrop-blur-md"
    >
      <div className="glass-card w-full max-w-lg p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Getting started
          </p>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold tabular-nums text-ink-300">
            {index + 1} / {total}
          </span>
        </div>

        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-electric transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div key={index} className="mt-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-electric/30 bg-electric/10">
            <Icon className="h-7 w-7 text-electric" strokeWidth={2} />
          </div>
          <h2 className="mt-5 font-display text-xl font-semibold text-ink-100">{slide.title}</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-300">{slide.body}</p>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === index ? "w-6 bg-electric" : i < index ? "w-1.5 bg-electric/40" : "w-1.5 bg-white/15"
              }`}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={index === 0} onClick={goPrev}>
            Back
          </Button>

          {isLast ? (
            <Button size="sm" icon={Rocket} onClick={finish} disabled={dataLoading}>
              {dataLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading
                </>
              ) : (
                "Start exploring"
              )}
            </Button>
          ) : (
            <Button size="sm" onClick={goNext}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-ink-700">
          {dataLoading
            ? "Loading your quizzes in the background…"
            : isLast
              ? "Your quizzes are ready behind this tour."
              : "This tour is shown only on your first visit."}
        </p>
      </div>
    </div>
  );
}
