import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight, ListChecks, Clock } from "lucide-react";
import Badge from "../../components/ui/Badge";
import Skeleton from "../../components/ui/Skeleton";
import DemoChip from "../../components/ui/DemoChip";
import { apiFetch } from "../../lib/api";
import { DEMO_ENABLED, demoLandingQuizzes } from "../../lib/demoData";

const STATUS_TONE = { upcoming: "upcoming", live: "live", completed: "completed" };

// Standalone page for the top nav's "Demo Quiz" tab. This used to be a
// section students had to scroll to on the Landing Page (anchored at
// #landing-quiz) — it now lives at its own route so it opens directly.
export default function DemoQuiz() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch("/quizzes?placement=landing")
      .then((data) => {
        if (!alive) return;
        const list = data.quizzes || [];
        if (list.length === 0 && DEMO_ENABLED) {
          setQuizzes(demoLandingQuizzes());
          setIsDemo(true);
        } else {
          setQuizzes(list);
        }
      })
      .catch(() => {
        if (!alive) return;
        if (DEMO_ENABLED) {
          setQuizzes(demoLandingQuizzes());
          setIsDemo(true);
        } else {
          setError("Couldn't load demo quizzes right now.");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
      <div className="mb-8 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-electric-light" />
        <div>
          <h1 className="flex flex-wrap items-center gap-3 font-display text-2xl font-semibold text-ink-100 sm:text-3xl">
            Demo Quiz {isDemo && <DemoChip />}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Try a sample quiz to see how live scoring, timers and the leaderboard work — no account required.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card p-10 text-center text-sm text-coral">{error}</div>
      ) : quizzes.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-ink-500">
          No demo quizzes are published right now — check back soon.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {quizzes.map((q) => (
            <div key={q.id} className="glass-card flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-base font-semibold leading-snug text-ink-100">{q.title}</h3>
                <Badge tone={STATUS_TONE[q.status] || "upcoming"} dot={q.status === "live"}>
                  {q.status}
                </Badge>
              </div>
              <p className="mt-1.5 line-clamp-2 flex-1 text-xs text-ink-500">
                {q.description || "No description provided."}
              </p>
              <div className="mt-4 flex items-center gap-4 text-xs text-ink-500">
                <span className="flex items-center gap-1">
                  <ListChecks className="h-3.5 w-3.5" /> {q.questionCount} Qs
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {q.durationMinutes}m
                </span>
              </div>
              {q.demo ? (
                <span
                  className="mt-5 inline-flex cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-ink-400"
                  title="Sample quiz: publish a demo quiz from the admin portal to enable joining"
                >
                  Sample quiz
                </span>
              ) : (
                <Link
                  to={`/login/${q.id}`}
                  className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-xl border border-electric/30 bg-electric/15 px-4 py-2.5 text-sm font-medium text-electric-light transition-all hover:bg-electric/25 hover:shadow-[0_0_22px_rgba(77,141,255,0.3)]"
                >
                  Join quiz <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
