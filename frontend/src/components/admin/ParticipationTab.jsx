import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Users, RefreshCw, Trash2, AlertCircle, Search, X, Download } from "lucide-react";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Skeleton from "../ui/Skeleton";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import { apiFetch, ApiError } from "../../lib/api";
import { exportParticipantsPdf } from "../../lib/exportParticipantsPdf";

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scoreLabel(p) {
  if (p.score === null || p.score === undefined) return "—";
  return p.totalMarks ? `${p.score} / ${p.totalMarks}` : String(p.score);
}

function statusTone(p) {
  if (p.completed || p.attemptStatus === "submitted" || p.attemptStatus === "auto_submitted") return "live";
  if (p.attemptStatus === "in_progress") return "draft";
  return "completed";
}

function statusLabel(p) {
  if (p.completed || p.attemptStatus === "submitted" || p.attemptStatus === "auto_submitted") return "Completed";
  if (p.attemptStatus === "in_progress") return "In progress";
  return "Joined";
}

/**
 * Admin Portal → Participation tab for a single quiz.
 * Lists everyone who joined this quiz, with a guarded delete per record.
 */
export default function ParticipationTab({ quizId, token, quizTitle }) {
  const { push } = useToast();
  const [participants, setParticipants] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [query, setQuery] = useState("");
  const deleteLock = useRef(false);

  // Name / Register Number search over the currently loaded participants —
  // same pattern as Admin → Results.
  const filteredParticipants = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter((p) => {
      const name = String(p.name || "").toLowerCase();
      const registerNumber = String(p.registerNumber || "").toLowerCase();
      return name.includes(q) || registerNumber.includes(q);
    });
  }, [participants, query]);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!quizId || quizId === "new") return;
      if (!silent) setLoading(true);
      try {
        let rows = [];
        let total = null;
        try {
          const data = await apiFetch(`/admin/quizzes/${quizId}/participants`, { token });
          rows = Array.isArray(data.participants) ? data.participants : [];
          total = typeof data.total === "number" ? data.total : null;
        } catch (err) {
          // Older/not-yet-restarted backends do not have the per-quiz route yet;
          // fall back to the generic participants endpoint so the table still shows.
          if (err instanceof ApiError && err.status === 404) {
            const legacy = await apiFetch(`/admin/participants?quizId=${quizId}`, { token });
            rows = (Array.isArray(legacy.participants) ? legacy.participants : []).map((r) => ({
              id: r.attendanceId ?? r.id,
              quizId,
              quizTitle: r.quiz?.title ?? "",
              name: r.student?.name ?? "Unknown",
              registerNumber: r.student?.register_number ?? null,
              email: r.student?.email ?? null,
              department: r.student?.department ?? null,
              year: r.student?.year ?? null,
              section: r.student?.section ?? null,
              participatedAt: r.joinTime ?? null,
              submissionTime: r.submissionTime ?? null,
              completed: r.completed,
              score: r.score ?? null,
              totalMarks: r.totalMarks ?? null,
              attemptStatus: r.attemptStatus ?? "not_started",
            }));
          } else {
            throw err;
          }
        }
        setParticipants(rows);
        setTotal(total ?? rows.length);
        setError(null);
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : "Something went wrong while loading participants.";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [quizId, token]
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    const target = confirmTarget;
    if (!target || deleteLock.current) return;
    deleteLock.current = true;
    setDeletingId(target.id);
    setConfirmTarget(null);
    try {
      const data = await apiFetch(`/admin/quizzes/${quizId}/participants/${target.id}`, {
        method: "DELETE",
        token,
      });
      setParticipants((prev) => {
        const next = prev.filter((p) => p.id !== target.id);
        setTotal(typeof data?.total === "number" ? data.total : next.length);
        return next;
      });
      push(`Removed ${target.name}'s participation record.`, "success");
      // Re-read from the server so the list matches the database exactly.
      load({ silent: true });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not delete this participation record.";
      push(message, "error");
      // Nothing was removed locally on failure; re-sync just in case.
      load({ silent: true });
    } finally {
      deleteLock.current = false;
      setDeletingId(null);
    }
  };

  const handleExportPdf = () => {
    try {
      exportParticipantsPdf({ quizTitle, participants: filteredParticipants });
    } catch {
      push("Failed to generate PDF.", "error");
    }
  };

  if (!quizId || quizId === "new") {
    return (
      <div className="glass-card p-10 text-center text-sm text-ink-500">
        Save the quiz first — participation is tracked once students start joining.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="glass-card flex items-center gap-3 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric/10">
            <Users className="h-5 w-5 text-electric-light" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-500">Total participants</p>
            <p className="font-display text-xl font-semibold text-ink-100">{loading ? "—" : total}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs sm:w-64">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or register no."
              aria-label="Search participants by name or register number"
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
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={handleExportPdf}
            disabled={loading || participants.length === 0}
          >
            Download PDF
          </Button>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => load()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      ) : error ? (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle className="h-6 w-6 text-coral" />
          <p className="text-sm text-ink-100">{error}</p>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => load()}>
            Try again
          </Button>
        </div>
      ) : participants.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-ink-500">
          No participants yet. Students appear here as soon as they join this quiz.
        </div>
      ) : filteredParticipants.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-ink-500">
          No participants match your search.
        </div>
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="glass-card hidden overflow-x-auto p-0 md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-3 font-medium">Participant</th>
                  <th className="px-4 py-3 font-medium">Register no.</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Year</th>
                  <th className="px-4 py-3 font-medium">Section</th>
                  <th className="px-4 py-3 font-medium">Quiz</th>
                  <th className="px-4 py-3 font-medium">Participated</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredParticipants.map((p) => (
                  <tr key={p.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-100">{p.name}</p>
                      {p.email && <p className="text-xs text-ink-500">{p.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-ink-500">{p.registerNumber || "—"}</td>
                    <td className="px-4 py-3 text-ink-500">{p.department || "—"}</td>
                    <td className="px-4 py-3 text-ink-500">{p.year || "—"}</td>
                    <td className="px-4 py-3 text-ink-500">{p.section || "—"}</td>
                    <td className="px-4 py-3 text-ink-500">{p.quizTitle}</td>
                    <td className="px-4 py-3 text-ink-500">{formatDateTime(p.participatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-ink-100">{scoreLabel(p)}</span>
                        <Badge tone={statusTone(p)}>{statusLabel(p)}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="danger"
                        size="sm"
                        icon={Trash2}
                        disabled={deletingId === p.id}
                        onClick={() => setConfirmTarget(p)}
                      >
                        {deletingId === p.id ? "Deleting..." : "Delete"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filteredParticipants.map((p) => (
              <div key={p.id} className="glass-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink-100">{p.name}</p>
                    <p className="text-xs text-ink-500">{p.registerNumber || "—"}</p>
                  </div>
                  <Badge tone={statusTone(p)}>{statusLabel(p)}</Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-500">
                  <div><dt className="text-ink-700">Department</dt><dd>{p.department || "—"}</dd></div>
                  <div><dt className="text-ink-700">Year / Section</dt><dd>{[p.year, p.section].filter(Boolean).join(" / ") || "—"}</dd></div>
                  <div><dt className="text-ink-700">Quiz</dt><dd>{p.quizTitle}</dd></div>
                  <div><dt className="text-ink-700">Participated</dt><dd>{formatDateTime(p.participatedAt)}</dd></div>
                  <div><dt className="text-ink-700">Score</dt><dd className="text-ink-100">{scoreLabel(p)}</dd></div>
                </dl>
                <Button
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                  className="mt-3 w-full"
                  disabled={deletingId === p.id}
                  onClick={() => setConfirmTarget(p)}
                >
                  {deletingId === p.id ? "Deleting..." : "Delete participation"}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title="Delete participation record?"
        description={
          confirmTarget
            ? `This removes ${confirmTarget.name}${
                confirmTarget.registerNumber ? ` (${confirmTarget.registerNumber})` : ""
              } from this quiz's participation list. Other participants, questions, rounds and results are not affected.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
