import { useEffect, useMemo, useState } from "react";
import { Search, Trophy, Download, UserRoundX, Medal } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import Skeleton from "../../components/ui/Skeleton";
import Button from "../../components/ui/Button";
import DemoChip from "../../components/ui/DemoChip";
import { useAdminAuth } from "../../lib/adminAuth";
import { apiFetch, ApiError } from "../../lib/api";
import { exportLeaderboardPdf } from "../../lib/exportLeaderboardPdf";
import { DEMO_ENABLED, demoAdminLeaderboard } from "../../lib/demoData";

function matches(row, q) {
  if (!q) return true;
  const name = String(row.name || "").toLowerCase();
  const registerNumber = String(row.registerNumber || "").toLowerCase();
  return name.includes(q) || registerNumber.includes(q);
}

function medalTone(rank) {
  if (rank === 1) return "text-amber";
  if (rank === 2) return "text-ink-100";
  if (rank === 3) return "text-[#C08A55]";
  return "text-ink-500";
}

function LeaderboardTable({ rows, emptyLabel }) {
  if (rows.length === 0) {
    return <div className="glass-card p-10 text-center text-sm text-ink-500">{emptyLabel}</div>;
  }
  return (
    <div className="glass-card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-xs uppercase tracking-wide text-ink-500">
            <th className="px-4 py-2.5">Rank</th>
            <th className="px-4 py-2.5">Name</th>
            <th className="px-4 py-2.5">Register Number</th>
            <th className="px-4 py-2.5">Dept / Year / Sec</th>
            <th className="px-4 py-2.5">Quizzes Attended</th>
            <th className="px-4 py-2.5">Cumulative %</th>
            <th className="px-4 py-2.5">Last Submitted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.studentId} className="border-b border-white/[0.04] last:border-0">
              <td className={`px-4 py-2.5 font-tabular font-semibold ${medalTone(r.rank)}`}>
                <span className="inline-flex items-center gap-1.5">
                  {r.rank <= 3 ? <Medal className="h-3.5 w-3.5" /> : null}#{r.rank}
                </span>
              </td>
              <td className="px-4 py-2.5 text-ink-100">{r.name}</td>
              <td className="px-4 py-2.5 font-tabular text-ink-500">{r.registerNumber}</td>
              <td className="px-4 py-2.5 text-ink-500">
                {[r.department, r.year, r.section].filter(Boolean).join(" / ") || "—"}
              </td>
              <td className="px-4 py-2.5 font-tabular text-ink-500">{r.quizzesAttended}</td>
              <td className="px-4 py-2.5 font-tabular font-semibold text-electric-light">
                {r.cumulativePercentage}%
              </td>
              <td className="px-4 py-2.5 text-xs text-ink-700">
                {r.lastSubmittedAt ? new Date(r.lastSubmittedAt).toLocaleString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Admin -> Leaderboard: cumulative percentage (average of every submitted
// attempt's percentage, across all quizzes) for signed-in students only.
// Guest accounts — students who attended without ever creating an account —
// are always kept in their own separate table with their own ranking, never
// merged into the signed-in ranking. The two are presented as clickable
// tabs so the admin views one focused table at a time.
export default function AdminLeaderboard() {
  const { token } = useAdminAuth();
  const [leaderboard, setLeaderboard] = useState([]);
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("signed-in"); // "signed-in" | "guests"
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch("/admin/leaderboard", { token })
      .then((data) => {
        const live = data.leaderboard || [];
        const liveGuests = data.guests || [];
        if (live.length === 0 && liveGuests.length === 0 && DEMO_ENABLED) {
          const demo = demoAdminLeaderboard();
          setLeaderboard(demo.leaderboard);
          setGuests(demo.guests);
          setIsDemo(true);
          return;
        }
        setLeaderboard(live);
        setGuests(liveGuests);
      })
      .catch((err) => {
        // Only an unreachable server falls back to sample rows; real API errors stay visible.
        if (DEMO_ENABLED && err instanceof ApiError && err.status === 0) {
          const demo = demoAdminLeaderboard();
          setLeaderboard(demo.leaderboard);
          setGuests(demo.guests);
          setIsDemo(true);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load leaderboard");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const q = query.trim().toLowerCase();
  const filteredLeaderboard = useMemo(() => leaderboard.filter((r) => matches(r, q)), [leaderboard, q]);
  const filteredGuests = useMemo(() => guests.filter((r) => matches(r, q)), [guests, q]);

  const handleDownload = () => {
    exportLeaderboardPdf({ leaderboard: filteredLeaderboard, guests: filteredGuests });
  };

  const tabs = [
    { key: "signed-in", label: "Signed-in users", icon: Trophy, count: filteredLeaderboard.length },
    { key: "guests", label: "Guest accounts", icon: UserRoundX, count: filteredGuests.length },
  ];

  return (
    <AdminLayout
      title="Leaderboard"
      subtitle="Signed-in users ranked by cumulative percentage — Guest accounts kept separate"
      actions={
        <Button
          size="sm"
          icon={Download}
          onClick={handleDownload}
          disabled={loading || (filteredLeaderboard.length === 0 && filteredGuests.length === 0)}
        >
          Download PDF
        </Button>
      }
    >
      {isDemo && (
        <div className="mb-4">
          <DemoChip>Showing sample rankings until students submit quizzes</DemoChip>
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or register number..."
            aria-label="Search leaderboard"
            className="glass w-full rounded-xl py-2.5 pl-10 pr-4 text-sm text-ink-100 placeholder:text-ink-700 outline-none focus:border-electric/40"
          />
        </div>
      </div>

      {/* Signed-in / Guest tabs */}
      <div className="mb-5 flex items-center gap-1.5 border-b border-white/[0.06]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${
                active ? "text-ink-100" : "text-ink-500 hover:text-ink-300"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-amber" : ""}`} />
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-tabular ${
                  active ? "bg-white/10 text-ink-100" : "bg-white/[0.04] text-ink-500"
                }`}
              >
                {tab.count}
              </span>
              {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-electric" />}
            </button>
          );
        })}
      </div>

      {loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : error ? (
        <div className="glass-card p-6 text-sm text-coral">{error}</div>
      ) : activeTab === "signed-in" ? (
        <LeaderboardTable
          rows={filteredLeaderboard}
          emptyLabel={
            leaderboard.length === 0
              ? "No signed-in student has submitted a quiz yet."
              : "No signed-in students match your search."
          }
        />
      ) : (
        <div>
          <p className="mb-3 text-xs text-ink-500">
            Attended a quiz without creating an account — kept separate from the signed-in ranking.
          </p>
          <LeaderboardTable
            rows={filteredGuests}
            emptyLabel={guests.length === 0 ? "No guest has submitted a quiz yet." : "No guests match your search."}
          />
        </div>
      )}
    </AdminLayout>
  );
}
