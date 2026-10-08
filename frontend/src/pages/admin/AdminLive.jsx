import { useEffect, useMemo, useState } from "react";
import { Users, Activity, CheckCircle2, Clock, Search, X, Eye } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import Badge from "../../components/ui/Badge";
import Skeleton from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { useAdminAuth } from "../../lib/adminAuth";
import { apiFetch, ApiError } from "../../lib/api";
import AttemptDetailModal from "../../components/admin/AttemptDetailModal";

const POLL_MS = 5000;

export default function AdminLive() {
  const { token } = useAdminAuth();
  const { push } = useToast();

  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuizId, setSelectedQuizId] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [viewingAttemptId, setViewingAttemptId] = useState(null);

  // Name / Register Number search over the live ranking table.
  const filteredRanking = useMemo(() => {
    const rows = snapshot?.ranking || [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => String(r.name || "").toLowerCase().includes(q) || String(r.registerNumber || "").toLowerCase().includes(q)
    );
  }, [snapshot, query]);

  useEffect(() => {
    apiFetch("/admin/quizzes", { token })
      .then((data) => {
        const live = data.quizzes.filter((q) => q.status === "live");
        setQuizzes(live.length > 0 ? live : data.quizzes);
        const preferred = live[0] || data.quizzes[0];
        if (preferred) setSelectedQuizId(preferred.id);
        else setLoading(false);
      })
      .catch((err) => push(err instanceof ApiError ? err.message : "Failed to load quizzes", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!selectedQuizId) return;
    let cancelled = false;

    const fetchSnapshot = async () => {
      // Don't burn requests (or database time) while the tab is in the
      // background — the next poll after refocus refreshes everything.
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const data = await apiFetch(`/admin/live/${selectedQuizId}`, { token });
        if (!cancelled) setSnapshot(data);
      } catch (err) {
        if (!cancelled) push(err instanceof ApiError ? err.message : "Failed to load live data", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) fetchSnapshot();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuizId, token]);

  return (
    <AdminLayout title="Live Monitor" subtitle="Auto-refreshes every 5 seconds">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={selectedQuizId}
          onChange={(e) => {
            setLoading(true);
            setSelectedQuizId(e.target.value);
          }}
          className="glass rounded-xl px-3.5 py-2.5 text-sm text-ink-100 outline-none focus:border-electric/40"
        >
          {quizzes.map((q) => (
            <option key={q.id} value={q.id}>
              {q.title}
            </option>
          ))}
        </select>
        {snapshot?.quiz?.status === "live" && <Badge tone="live" dot>Live</Badge>}

        <div className="relative w-full max-w-xs sm:w-64">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or register no."
            aria-label="Search live activity by name or register number"
            className="glass w-full rounded-xl py-2.5 pl-10 pr-9 text-sm text-ink-100 placeholder:text-ink-700 outline-none focus:border-electric/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !snapshot ? (
        <div className="glass-card p-10 text-center text-sm text-ink-500">Create a quiz first to monitor it here.</div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Tile icon={Users} label="Joined" value={snapshot.tiles.online} accent="text-electric-light" />
            <Tile icon={Activity} label="In progress" value={snapshot.tiles.active} accent="text-amber" />
            <Tile icon={CheckCircle2} label="Submitted" value={snapshot.tiles.submitted} accent="text-mint" />
            <Tile icon={Clock} label="Not started" value={snapshot.tiles.notStarted} accent="text-ink-500" />
          </div>

          <div className="glass-card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Register No.</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Violations</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredRanking.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-ink-500">
                      {snapshot.ranking.length === 0 ? "No activity yet." : "No students match your search."}
                    </td>
                  </tr>
                ) : (
                  filteredRanking.map((r) => (
                    <tr key={r.rank} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-4 py-3 text-ink-500">{r.rank}</td>
                      <td className="px-4 py-3 text-ink-100">{r.name}</td>
                      <td className="px-4 py-3 text-ink-500">{r.registerNumber}</td>
                      <td className="px-4 py-3 font-tabular text-ink-100">{r.score ?? "—"}</td>
                      <td className="px-4 py-3 text-ink-500">{r.violations}</td>
                      <td className="px-4 py-3">
                        <Badge tone={r.status === "in_progress" ? "upcoming" : "live"}>
                          {r.status === "in_progress" ? "Writing" : "Submitted"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.attemptId ? (
                          <button
                            type="button"
                            onClick={() => setViewingAttemptId(r.attemptId)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-500 transition-colors hover:text-electric-light"
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </button>
                        ) : (
                          <span className="text-xs text-ink-700">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AttemptDetailModal
        attemptId={viewingAttemptId}
        onClose={() => setViewingAttemptId(null)}
        token={token}
        push={push}
      />
    </AdminLayout>
  );
}

function Tile({ icon: Icon, label, value, accent }) {
  return (
    <div className="glass-card p-4">
      <p className="flex items-center gap-1.5 text-xs text-ink-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className={`mt-1 font-display text-2xl font-semibold ${accent}`}>{value}</p>
    </div>
  );
}
