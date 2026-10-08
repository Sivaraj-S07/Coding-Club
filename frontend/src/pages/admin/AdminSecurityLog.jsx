import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, Search, RefreshCw } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import Skeleton from "../../components/ui/Skeleton";
import Button from "../../components/ui/Button";
import { useAdminAuth } from "../../lib/adminAuth";
import { apiFetch, ApiError } from "../../lib/api";

// Human-readable labels for the reasons the backend can report (kept in
// sync with quizAttemptController.js's COUNTED_REASONS — every reason that
// can actually trigger a logout ends up here).
const REASON_LABELS = {
  tab_switch: "Tab switch / left the quiz",
  window_blur: "Switched to another app/window",
  fullscreen_exit: "Exited fullscreen / secure mode",
  new_tab_blocked: "Opened another tab, window, or third-party site",
  devtools_attempt: "Attempted to open developer tools",
  navigation_attempt: "Attempted to navigate away",
  screenshot_attempt: "Screenshot / screen-capture attempt",
};

function reasonLabel(reason) {
  return REASON_LABELS[reason] || reason;
}

function formatDetails(details) {
  if (!details || typeof details !== "object") return "—";
  const parts = [];
  if (details.violationsCount !== undefined && details.limit !== undefined) {
    parts.push(`${details.violationsCount}/${details.limit} violations`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

export default function AdminSecurityLog() {
  const { token } = useAdminAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    apiFetch("/admin/logout-events", { token })
      .then((data) => setEvents(data.events || []))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load security log"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return events;
    return events.filter((e) => {
      const name = String(e.studentName || "").toLowerCase();
      const registerNumber = String(e.registerNumber || "").toLowerCase();
      const quizTitle = String(e.quizTitle || "").toLowerCase();
      const reason = String(reasonLabel(e.reason) || "").toLowerCase();
      return name.includes(q) || registerNumber.includes(q) || quizTitle.includes(q) || reason.includes(q);
    });
  }, [events, q]);

  return (
    <AdminLayout
      title="Security Log"
      subtitle="Forced quiz logouts from the proctoring system — exact reason, details and timestamp"
      actions={
        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={load} disabled={loading}>
          Refresh
        </Button>
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, register number, quiz or reason..."
            aria-label="Search security log"
            className="glass w-full rounded-xl py-2.5 pl-10 pr-4 text-sm text-ink-100 placeholder:text-ink-700 outline-none focus:border-electric/40"
          />
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : error ? (
        <div className="glass-card p-6 text-sm text-coral">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-ink-500">
          {events.length === 0
            ? "No forced logouts recorded yet — students proctored out of a quiz will show up here."
            : "No events match your search."}
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-xs uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2.5">Student</th>
                <th className="px-4 py-2.5">Register No.</th>
                <th className="px-4 py-2.5">Quiz</th>
                <th className="px-4 py-2.5">Reason</th>
                <th className="px-4 py-2.5">Details</th>
                <th className="px-4 py-2.5">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-white/[0.04] last:border-0 align-top">
                  <td className="px-4 py-2.5 text-ink-100">{e.studentName}</td>
                  <td className="px-4 py-2.5 font-tabular text-ink-500">{e.registerNumber || "—"}</td>
                  <td className="px-4 py-2.5 text-ink-500">{e.quizTitle}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-coral/10 px-2.5 py-1 text-xs font-medium text-coral">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {reasonLabel(e.reason)}
                    </span>
                    <p className="mt-1.5 max-w-sm text-xs text-ink-500">{e.message}</p>
                  </td>
                  <td className="px-4 py-2.5 font-tabular text-xs text-ink-500">{formatDetails(e.details)}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-700">
                    {e.createdAt ? new Date(e.createdAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
