import { useEffect, useState } from "react";
import { Trophy, Terminal, CalendarCheck, Activity, Trash2, Code2 } from "lucide-react";
import Badge from "../ui/Badge";
import Skeleton from "../ui/Skeleton";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import { apiFetch, ApiError } from "../../lib/api";
import LearningInsightsPanel from "./LearningInsightsPanel";

const STATUS_TONE = { submitted: "live", auto_submitted: "upcoming", in_progress: "draft" };
const VERDICT_TONE = { ok: "live", error: "danger", timeout: "upcoming", compile_error: "danger" };

function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

/**
 * A student's complete dashboard, opened by clicking "View" (or a row) in
 * either Admin → User Accounts or Admin → Guest Accounts: profile, quiz
 * history, programming/coding activity, attendance and a recent activity
 * log — plus a secure Delete User action, gated behind a confirmation
 * dialog.
 */
export default function StudentDetailModal({ studentId, onClose, token, push, onDeleted }) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    let alive = true;
    setLoading(true);
    setDetail(null);
    setConfirmingDelete(false);
    apiFetch(`/admin/students/${studentId}`, { token })
      .then((data) => alive && setDetail(data))
      .catch((err) => alive && push(err instanceof ApiError ? err.message : "Failed to load student", "error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [studentId, token, push]);

  const handleDelete = async () => {
    if (!detail) return;
    setDeleting(true);
    try {
      await apiFetch(`/admin/students/${studentId}`, { method: "DELETE", token });
      push(`Deleted account for ${detail.student.name}`, "success");
      setConfirmingDelete(false);
      onDeleted?.(studentId);
      onClose?.();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to delete account", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Modal open={Boolean(studentId)} onClose={onClose} title="Account detail" maxWidth="max-w-2xl">
        {loading ? (
          <Skeleton className="h-56 rounded-2xl" />
        ) : !detail ? (
          <p className="p-6 text-sm text-ink-500">Could not load this account.</p>
        ) : (
          <div className="space-y-6 p-1">
            <div className="glass-card grid gap-3 p-4 text-sm sm:grid-cols-2">
              <p className="text-ink-100">
                <span className="text-ink-500">Name: </span>
                {detail.student.name}
              </p>
              <p className="text-ink-100">
                <span className="text-ink-500">Username: </span>
                {detail.student.username || "— (no account, attended as guest)"}
              </p>
              <p className="text-ink-100 font-tabular">
                <span className="text-ink-500">Register No.: </span>
                {detail.student.registerNumber}
              </p>
              <p className="text-ink-100">
                <span className="text-ink-500">Mobile: </span>
                {detail.student.mobileNumber || "—"}
              </p>
              <p className="text-ink-100">
                <span className="text-ink-500">Email: </span>
                {detail.student.email || "—"}
              </p>
              <p className="text-ink-100">
                <span className="text-ink-500">Dept / Year / Sec: </span>
                {[detail.student.department, detail.student.year, detail.student.section].filter(Boolean).join(" / ") || "—"}
              </p>
              <p className="text-ink-100">
                <span className="text-ink-500">Batch: </span>
                {detail.student.batch ? detail.student.batch.replace("-", "\u2013") : "—"}
              </p>
              <p className="text-ink-100">
                <span className="text-ink-500">Cumulative Percentage: </span>
                <span className="font-tabular font-semibold text-electric-light">
                  {detail.student.cumulativePercentage === null || detail.student.cumulativePercentage === undefined
                    ? "— (no graded attempts yet)"
                    : `${detail.student.cumulativePercentage}%`}
                </span>
              </p>
              {detail.student.bio && (
                <p className="text-ink-100 sm:col-span-2">
                  <span className="text-ink-500">Bio: </span>
                  {detail.student.bio}
                </p>
              )}
            </div>

            {detail.summary && (
              <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                <div className="glass-card p-3">
                  <p className="font-tabular text-lg font-semibold text-ink-100">{detail.summary.quizzesAttempted}</p>
                  <p className="text-[11px] uppercase tracking-wide text-ink-500">Quizzes</p>
                </div>
                <div className="glass-card p-3">
                  <p className="font-tabular text-lg font-semibold text-ink-100">{detail.summary.programsAttempted}</p>
                  <p className="text-[11px] uppercase tracking-wide text-ink-500">Quiz programs</p>
                </div>
                <div className="glass-card p-3">
                  <p className="font-tabular text-lg font-semibold text-ink-100">
                    {detail.summary.playgroundRunsRecorded ?? 0}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-ink-500">Playground runs</p>
                </div>
                <div className="glass-card p-3">
                  <p className="font-tabular text-lg font-semibold text-ink-100">{detail.summary.attendanceRecorded}</p>
                  <p className="text-[11px] uppercase tracking-wide text-ink-500">Attendance</p>
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-2 flex items-center gap-1.5 font-display text-sm font-semibold text-ink-100">
                <Trophy className="h-4 w-4 text-amber" /> Quiz history ({detail.attempts.length})
              </h3>
              {detail.attempts.length === 0 ? (
                <p className="text-sm text-ink-500">No quiz attempts yet.</p>
              ) : (
                <div className="glass-card overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-xs uppercase tracking-wide text-ink-500">
                        <th className="px-4 py-2.5">Quiz</th>
                        <th className="px-4 py-2.5">Score</th>
                        <th className="px-4 py-2.5">%</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.attempts.map((a) => (
                        <tr key={a.id} className="border-b border-white/[0.04] last:border-0">
                          <td className="px-4 py-2.5 text-ink-100">{a.quizTitle}</td>
                          <td className="px-4 py-2.5 font-tabular text-ink-100">
                            {a.obtainedMarks ?? "—"} / {a.totalMarks ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 font-tabular text-ink-100">{a.percentage ?? "—"}%</td>
                          <td className="px-4 py-2.5">
                            <Badge tone={STATUS_TONE[a.status] || "draft"}>{a.status}</Badge>
                          </td>
                          <td className="px-4 py-2.5">
                            {a.passed === null || a.passed === undefined ? (
                              "—"
                            ) : (
                              <Badge tone={a.passed ? "live" : "danger"}>{a.passed ? "Pass" : "Fail"}</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {detail.programs && detail.programs.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 font-display text-sm font-semibold text-ink-100">
                  <Terminal className="h-4 w-4 text-electric-light" /> Quiz programming answers ({detail.programs.length})
                </h3>
                <div className="glass-card overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-xs uppercase tracking-wide text-ink-500">
                        <th className="px-4 py-2.5">Quiz</th>
                        <th className="px-4 py-2.5">Language</th>
                        <th className="px-4 py-2.5">Tests</th>
                        <th className="px-4 py-2.5">Verdict</th>
                        <th className="px-4 py-2.5">Marks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.programs.map((p) => (
                        <tr key={p.id} className="border-b border-white/[0.04] last:border-0">
                          <td className="px-4 py-2.5 text-ink-100">{p.quizTitle}</td>
                          <td className="px-4 py-2.5 text-ink-100">{p.language || "—"}</td>
                          <td className="px-4 py-2.5 font-tabular text-ink-100">
                            {p.testsPassed ?? "—"} / {p.testsTotal ?? "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            {p.verdict ? <Badge tone={VERDICT_TONE[p.verdict] || "draft"}>{p.verdict}</Badge> : "—"}
                          </td>
                          <td className="px-4 py-2.5 font-tabular text-ink-100">{p.marksAwarded ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detail.playgroundRuns && detail.playgroundRuns.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 font-display text-sm font-semibold text-ink-100">
                  <Code2 className="h-4 w-4 text-violet" /> Playground practice ({detail.playgroundRuns.length})
                </h3>
                <div className="glass-card overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-xs uppercase tracking-wide text-ink-500">
                        <th className="px-4 py-2.5">Language</th>
                        <th className="px-4 py-2.5">Result</th>
                        <th className="px-4 py-2.5">Time</th>
                        <th className="px-4 py-2.5">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.playgroundRuns.map((r) => (
                        <tr key={r.id} className="border-b border-white/[0.04] last:border-0">
                          <td className="px-4 py-2.5 text-ink-100">{r.language || "—"}</td>
                          <td className="px-4 py-2.5">
                            <Badge tone={r.status === "ok" ? "live" : "danger"}>{r.status}</Badge>
                          </td>
                          <td className="px-4 py-2.5 font-tabular text-ink-100">
                            {typeof r.timeMs === "number" ? `${r.timeMs} ms` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-ink-500">{formatDateTime(r.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detail.attendance && detail.attendance.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 font-display text-sm font-semibold text-ink-100">
                  <CalendarCheck className="h-4 w-4 text-mint" /> Attendance ({detail.attendance.length})
                </h3>
                <div className="glass-card overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-xs uppercase tracking-wide text-ink-500">
                        <th className="px-4 py-2.5">Quiz</th>
                        <th className="px-4 py-2.5">Joined</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.attendance.map((r) => (
                        <tr key={r.id} className="border-b border-white/[0.04] last:border-0">
                          <td className="px-4 py-2.5 text-ink-100">{r.quizTitle}</td>
                          <td className="px-4 py-2.5 text-ink-500">{formatDateTime(r.joinTime)}</td>
                          <td className="px-4 py-2.5">
                            <Badge tone={r.status === "present" ? "live" : "danger"}>{r.status}</Badge>
                          </td>
                          <td className="px-4 py-2.5 text-ink-100">{r.completed ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detail.activity && detail.activity.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 font-display text-sm font-semibold text-ink-100">
                  <Activity className="h-4 w-4 text-coral" /> Recent activity ({detail.activity.length})
                </h3>
                <div className="glass-card divide-y divide-white/[0.04]">
                  {detail.activity.map((e) => (
                    <div key={e.id} className="p-3.5 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-ink-100">{e.quizTitle || "—"}</p>
                        <span className="shrink-0 text-xs text-ink-500">{formatDateTime(e.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-xs text-ink-500">{e.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <LearningInsightsPanel studentId={studentId} token={token} />

            <div className="flex justify-end border-t border-white/[0.06] pt-4">
              <Button variant="danger" size="sm" icon={Trash2} onClick={() => setConfirmingDelete(true)}>
                Delete user
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this user account?"
        description={
          detail
            ? `This permanently deletes ${detail.student.name} (${detail.student.registerNumber}) along with every quiz attempt, answer, attendance record, Playground practice run and activity log entry on file. This cannot be undone.`
            : ""
        }
        confirmLabel={deleting ? "Deleting…" : "Delete permanently"}
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={handleDelete}
        onCancel={() => !deleting && setConfirmingDelete(false)}
      />
    </>
  );
}
