import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ListChecks, Clock, Users, ArrowRight, Search } from "lucide-react";
import Badge from "../../components/ui/Badge";
import Skeleton from "../../components/ui/Skeleton";
import DemoChip from "../../components/ui/DemoChip";
import { apiFetch } from "../../lib/api";
import { DEMO_ENABLED, demoQuizzes } from "../../lib/demoData";

const STATUS_TONE = { upcoming: "upcoming", live: "live", completed: "completed" };
const FILTERS = ["all", "live", "upcoming", "completed"];

export default function Quizzes() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    let alive = true;
    apiFetch("/quizzes")
      .then((data) => {
        if (!alive) return;
        const list = data.quizzes || [];
        if (list.length === 0 && DEMO_ENABLED) {
          setQuizzes(demoQuizzes());
          setIsDemo(true);
        } else {
          setQuizzes(list);
        }
      })
      .catch((err) => {
        if (!alive) return;
        if (DEMO_ENABLED) {
          setQuizzes(demoQuizzes());
          setIsDemo(true);
        } else {
          setError(err?.message || "Failed to load quizzes");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return quizzes.filter((quiz) => {
      const matchesStatus = status === "all" || quiz.status === status;
      const matchesQuery =
        !q ||
        String(quiz.title || "").toLowerCase().includes(q) ||
        String(quiz.description || "").toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [quizzes, query, status]);

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl font-semibold text-ink-100">
            All quizzes {isDemo && <DemoChip />}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Browse every published quiz and search by title or topic.
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search quizzes..."
            aria-label="Search quizzes"
            className="w-full rounded-xl border hairline bg-white/5 py-2.5 pl-9 pr-3 text-sm text-ink-100 backdrop-blur placeholder:text-ink-500 transition focus:border-electric/60 focus:outline-none focus:ring-2 focus:ring-electric/30"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatus(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              status === f ? "border border-electric/40 bg-electric/20 text-electric-light shadow-[0_0_16px_rgba(77,141,255,0.25)]" : "border border-white/10 bg-white/5 text-ink-400 hover:text-ink-100"
            }`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-ink-500">
          {loading ? "Loading…" : `${filtered.length} of ${quizzes.length} quizzes`}
        </span>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <div className="glass-card p-10 text-center text-sm text-rose-300">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-10 text-center text-sm text-ink-500">
            {quizzes.length === 0 ? "No quizzes are published yet." : "No quizzes match your search."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((q) => (
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
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {q.participantCount}
                  </span>
                </div>
                {q.demo ? (
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-ink-400"
                      title="Sample quiz: publish a real quiz from the admin portal to enable joining"
                    >
                      Sample quiz
                    </span>
                    {q.status === "completed" && (
                      <Link
                        to={`/leaderboard/${q.id}`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-electric/30 bg-electric/15 px-4 py-2.5 text-sm font-medium text-electric-light transition-colors hover:bg-electric/25"
                      >
                        Leaderboard <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
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
    </div>
  );
}
