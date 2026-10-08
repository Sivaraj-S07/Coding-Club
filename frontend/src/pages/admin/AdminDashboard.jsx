import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ListChecks, Users, FileCheck2, TrendingUp, Plus } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import StatCard from "../../components/StatCard";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Skeleton from "../../components/ui/Skeleton";
import DemoChip from "../../components/ui/DemoChip";
import { useToast } from "../../components/ui/Toast";
import { useAdminAuth } from "../../lib/adminAuth";
import { apiFetch, ApiError } from "../../lib/api";
import { DEMO_ENABLED, demoAdminDashboard, demoQuizzes } from "../../lib/demoData";

export default function AdminDashboard() {
  const { token } = useAdminAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [quizCounts, setQuizCounts] = useState({ live: 0, upcoming: 0, completed: 0 });
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function applyDemo() {
      const demo = demoAdminDashboard();
      const list = demoQuizzes();
      setStats(demo.stats);
      setRecentActivity(demo.recentActivity);
      setQuizCounts({
        live: list.filter((q) => q.status === "live").length,
        upcoming: list.filter((q) => q.status === "upcoming").length,
        completed: list.filter((q) => q.status === "completed").length,
      });
      setIsDemo(true);
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [dashboardData, quizzesData] = await Promise.all([
          apiFetch("/admin/dashboard", { token }),
          apiFetch("/admin/quizzes", { token }),
        ]);
        if (cancelled) return;
        const empty =
          !dashboardData.stats ||
          (!dashboardData.stats.totalQuizzes && !dashboardData.stats.totalStudents && !dashboardData.stats.totalParticipants);
        if (empty && DEMO_ENABLED) {
          applyDemo();
          return;
        }
        setStats(dashboardData.stats);
        setRecentActivity(dashboardData.recentActivity || []);
        setQuizCounts({
          live: quizzesData.quizzes.filter((q) => q.status === "live").length,
          upcoming: quizzesData.quizzes.filter((q) => q.status === "upcoming").length,
          completed: quizzesData.quizzes.filter((q) => q.status === "completed").length,
        });
      } catch (err) {
        if (cancelled) return;
        // Only an unreachable server falls back to sample numbers; real API errors stay visible.
        if (DEMO_ENABLED && err instanceof ApiError && err.status === 0) {
          applyDemo();
          return;
        }
        const message = err instanceof ApiError ? err.message : "Failed to load dashboard";
        setError(message);
        push(message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, push]);

  return (
    <AdminLayout
      title="Dashboard"
      subtitle="Overview of quizzes, students and results"
      actions={
        <Button size="sm" icon={Plus} onClick={() => navigate("/admin/quizzes")}>
          New Quiz
        </Button>
      }
    >
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card p-6 text-sm text-coral">{error}</div>
      ) : (
        <>
          {isDemo && (
            <div className="mb-4">
              <DemoChip>Showing sample numbers until real quizzes and submissions exist</DemoChip>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={ListChecks} label="Total quizzes" value={stats.totalQuizzes} accent="electric" />
            <StatCard icon={Users} label="Total students" value={stats.totalStudents} accent="violet" />
            <StatCard icon={FileCheck2} label="Submissions" value={stats.totalParticipants} accent="mint" />
            <StatCard icon={TrendingUp} label="Average score" value={`${stats.averageScore}%`} accent="amber" />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="glass-card flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-ink-500">Live now</p>
                <p className="font-display text-xl font-semibold text-ink-100">{quizCounts.live}</p>
              </div>
              <Badge tone="live" dot>Live</Badge>
            </div>
            <div className="glass-card flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-ink-500">Upcoming</p>
                <p className="font-display text-xl font-semibold text-ink-100">{quizCounts.upcoming}</p>
              </div>
              <Badge tone="upcoming">Scheduled</Badge>
            </div>
            <div className="glass-card flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-ink-500">Completed</p>
                <p className="font-display text-xl font-semibold text-ink-100">{quizCounts.completed}</p>
              </div>
              <Badge tone="completed">Archived</Badge>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="glass-card p-5">
              <p className="text-xs text-ink-500">Present</p>
              <p className="mt-1 font-display text-2xl font-semibold text-mint">{stats.present}</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs text-ink-500">Absent</p>
              <p className="mt-1 font-display text-2xl font-semibold text-coral">{stats.absent}</p>
            </div>
          </div>

          <div className="glass-card mt-4 p-5">
            <h3 className="font-display text-sm font-semibold text-ink-100">Recent submissions</h3>
            {recentActivity.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">No submissions yet.</p>
            ) : (
              <div className="mt-3 divide-y divide-white/[0.06]">
                {recentActivity.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-electric to-violet text-[11px] font-semibold text-void">
                        {s.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-100">{s.name}</p>
                        <p className="truncate text-xs text-ink-500">{s.quiz}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="font-tabular text-sm font-medium text-mint">{s.score} pts</span>
                      <span className="text-xs text-ink-700">
                        {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  );
}
