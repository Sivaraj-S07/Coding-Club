import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Trophy } from "lucide-react";
import Skeleton from "../../components/ui/Skeleton";
import DemoChip from "../../components/ui/DemoChip";
import { apiFetch, ApiError } from "../../lib/api";
import { DEMO_ENABLED, demoLeaderboard, isDemoId } from "../../lib/demoData";

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function Leaderboard() {
  const { quizId } = useParams();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    // Sample quizzes have no server-side record, so show their sample board directly.
    if (isDemoId(quizId) && DEMO_ENABLED) {
      const demo = demoLeaderboard(quizId);
      setTitle(demo.quizTitle);
      setRows(demo.leaderboard);
      setIsDemo(true);
      setLoading(false);
      return;
    }
    apiFetch(`/quizzes/${quizId}/leaderboard`)
      .then((data) => {
        setTitle(data.quizTitle);
        setRows(data.leaderboard);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load leaderboard"))
      .finally(() => setLoading(false));
  }, [quizId]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 lg:px-8">
      <Link to="/quizzes" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-100 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to quizzes
      </Link>

      <div className="mb-5 flex items-center gap-2">
        <Trophy className="h-5 w-5 text-amber" />
        <h1 className="font-display text-xl font-semibold text-ink-100">{title || "Leaderboard"}</h1>
        {isDemo && <DemoChip />}
      </div>

      {loading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : error ? (
        <div className="glass-card p-8 text-center text-sm text-ink-500">{error}</div>
      ) : rows.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-ink-500">No submissions yet.</div>
      ) : (
        <div className="glass-card divide-y divide-white/[0.06] overflow-hidden">
          {rows.map((r) => (
            <div key={r.attemptId || `${r.registerNumber}-${r.rank}`} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                    r.rank === 1
                      ? "bg-amber/20 text-amber shadow-[0_0_14px_rgba(251,194,109,0.35)]"
                      : r.rank === 2
                      ? "bg-white/10 text-ink-100"
                      : r.rank === 3
                      ? "bg-[#CD7F32]/20 text-[#CD7F32]"
                      : "bg-white/[0.04] text-ink-500"
                  }`}
                >
                  {r.rank}
                </span>
                <div>
                  <p className="text-sm font-medium text-ink-100">{r.name}</p>
                  <p className="text-xs text-ink-500">{r.registerNumber}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="font-tabular text-sm font-semibold text-mint">{r.score} pts</span>
                {formatDuration(r.timeTakenSeconds) && (
                  <p className="font-tabular text-xs text-ink-500">{formatDuration(r.timeTakenSeconds)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
