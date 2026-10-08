import { useEffect, useState } from "react";
import { Search, Info, Eye, Trash2 } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import Skeleton from "../../components/ui/Skeleton";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { useAdminAuth } from "../../lib/adminAuth";
import { apiFetch, ApiError } from "../../lib/api";
import StudentDetailModal from "../../components/admin/StudentDetailModal";

// Admin-only table of GUEST students — people who attended a quiz (joined
// via the per-quiz login form) but never signed up for an account, so their
// `students` row has no username/password. Students with an account live in
// Admin -> User Accounts instead. Click a row, or its View button, to see
// full details and quiz history, same as User Accounts; Delete permanently
// removes the account after a confirmation step.
export default function AdminGuestAccounts() {
  const { token } = useAdminAuth();
  const { push } = useToast();

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [viewingId, setViewingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      apiFetch(
        `/admin/students?accountType=guest&limit=500${
          query.trim() ? `&search=${encodeURIComponent(query.trim())}` : ""
        }`,
        { token }
      )
        .then((data) => setStudents(data.students || []))
        .catch((err) => {
          const message = err instanceof ApiError ? err.message : "Failed to load guest accounts";
          setError(message);
          push(message, "error");
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, token]);

  const handleRemoveFromList = (id) => {
    setStudents((prev) => prev.filter((s) => s.id !== id));
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/admin/students/${deleteTarget.id}`, { method: "DELETE", token });
      push(`Deleted account for ${deleteTarget.name}`, "success");
      handleRemoveFromList(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to delete account", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminLayout title="Guest Accounts" subtitle="Attended a quiz without signing up — View for full details, or Delete to remove permanently">
      <div className="mb-5 flex items-center gap-2 rounded-xl bg-electric/5 px-4 py-3 text-xs text-ink-500">
        <Info className="h-3.5 w-3.5 flex-none text-electric-light" />
        These students joined a quiz directly and never created a Sign Up account. If they sign up later with the
        same register number, they'll move to User Accounts automatically.
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by register number or name..."
            aria-label="Search guest accounts"
            className="glass w-full rounded-xl py-2.5 pl-10 pr-4 text-sm text-ink-100 placeholder:text-ink-700 outline-none focus:border-electric/40"
          />
        </div>
        <span className="text-xs text-ink-500">{loading ? "Loading…" : `${students.length} guests`}</span>
      </div>

      {loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : error ? (
        <div className="glass-card p-6 text-sm text-coral">{error}</div>
      ) : students.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-ink-500">No guest attendees found.</div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-xs uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2.5">Register Number</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Dept / Year / Sec</th>
                <th className="px-4 py-2.5">Mobile</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setViewingId(s.id)}
                  className="cursor-pointer border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-2.5 font-tabular text-ink-100">{s.registerNumber}</td>
                  <td className="px-4 py-2.5 text-ink-100">{s.name}</td>
                  <td className="px-4 py-2.5 text-ink-500">
                    {[s.department, s.year, s.section].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-ink-500">{s.mobileNumber || "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingId(s.id);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-electric/10 px-2.5 py-1.5 text-xs font-medium text-electric-light transition-colors hover:bg-electric/20"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(s);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-coral/10 px-2.5 py-1.5 text-xs font-medium text-coral transition-colors hover:bg-coral/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <StudentDetailModal
        studentId={viewingId}
        onClose={() => setViewingId(null)}
        token={token}
        push={push}
        onDeleted={handleRemoveFromList}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this guest account?"
        description={
          deleteTarget
            ? `This permanently deletes ${deleteTarget.name} (${deleteTarget.registerNumber}) along with every quiz attempt, answer, attendance record and activity log entry on file. This cannot be undone.`
            : ""
        }
        confirmLabel={deleting ? "Deleting…" : "Delete permanently"}
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </AdminLayout>
  );
}
