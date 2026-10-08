import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Copy, Trash2, Radio, Eye, Sparkles } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Skeleton from "../../components/ui/Skeleton";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import {
  CopyQuizButton,
  PasteQuizButton,
  PasteQuizModal,
  QuizClipboardBanner,
} from "../../components/admin/QuizClipboard";
import {
  ExportQuizPdfButton,
  ImportQuizPdfButton,
  ImportQuizPdfModal,
} from "../../components/admin/QuizPdfTransfer";
import { useToast } from "../../components/ui/Toast";
import { useAdminAuth } from "../../lib/adminAuth";
import { apiFetch, ApiError } from "../../lib/api";

const statusTone = { draft: "draft", upcoming: "upcoming", live: "live", completed: "completed" };

// Separate tab for quizzes shown on the public Landing Page — same quiz
// builder and join flow as the normal Quizzes tab, just filtered to
// placement=landing so the two lists never mix.
export default function AdminLandingQuizzes() {
  const { token } = useAdminAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [importPdfOpen, setImportPdfOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/admin/quizzes?placement=landing", { token });
      setQuizzes(data.quizzes);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to load landing page quizzes";
      setError(message);
      push(message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = quizzes.filter((q) => q.title.toLowerCase().includes(search.toLowerCase()));

  const handleDuplicate = async (quiz) => {
    try {
      await apiFetch("/admin/quizzes", {
        method: "POST",
        token,
        body: {
          title: `${quiz.title} (Copy)`,
          description: quiz.description,
          password: "changeme123",
          durationMinutes: quiz.durationMinutes,
          maxMarks: quiz.maxMarks,
          passingPercentage: quiz.passingPercentage,
          maxAttempts: quiz.maxAttempts,
          status: "draft",
          placement: "landing",
        },
      });
      push('Quiz duplicated as draft. Default password is "changeme123" — change it before publishing.', "success");
      load();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to duplicate quiz", "error");
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await apiFetch(`/admin/quizzes/${confirmDelete.id}`, { method: "DELETE", token });
      push("Quiz deleted.", "success");
      setConfirmDelete(null);
      load();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to delete quiz", "error");
    }
  };

  const handlePublishToggle = async (quiz) => {
    const nextStatus = quiz.status === "draft" ? "live" : quiz.status === "live" ? "completed" : "live";
    try {
      await apiFetch(`/admin/quizzes/${quiz.id}/status`, { method: "PATCH", token, body: { status: nextStatus } });
      push(`Quiz marked as ${nextStatus}.`, "success");
      load();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to update status", "error");
    }
  };

  return (
    <AdminLayout
      title="Demo Quizzes"
      subtitle="Create and manage quizzes shown on the public Landing Page"
      actions={
        <>
          <ImportQuizPdfButton onClick={() => setImportPdfOpen(true)} />
          <PasteQuizButton onClick={() => setPasteOpen(true)} />
          <Button size="sm" icon={Plus} onClick={() => navigate("/admin/landing-quizzes/new")}>
            New Demo Quiz
          </Button>
        </>
      }
    >
      <div className="mb-5 flex items-center gap-2 rounded-xl bg-electric/5 px-4 py-3 text-xs text-ink-500">
        <Sparkles className="h-3.5 w-3.5 flex-none text-electric-light" />
        Quizzes here appear in a dedicated section on the Landing Page, separate from the normal
        Quizzes tab. Students still need to sign up / sign in to join, exactly like any other quiz.
      </div>

      <QuizClipboardBanner placement="landing" onPaste={() => setPasteOpen(true)} />

      <div className="mb-5 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search demo quizzes..."
          className="glass w-full rounded-xl py-2.5 pl-10 pr-4 text-sm text-ink-100 placeholder:text-ink-700 outline-none focus:border-electric/40"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card p-6 text-sm text-coral">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-ink-500">
          No demo quizzes yet. Click "New Demo Quiz" to create one.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((quiz) => (
            <div key={quiz.id} className="glass-card group relative p-5">
              <div className="flex items-start justify-between gap-2">
                <Badge tone={statusTone[quiz.status]} dot={quiz.status === "live"}>
                  {quiz.status}
                </Badge>
                <div className="flex flex-wrap items-start justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Eye}
                    onClick={() => navigate(`/admin/landing-quizzes/${quiz.id}`)}
                  >
                    Open
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Radio}
                    onClick={() => handlePublishToggle(quiz)}
                  >
                    {quiz.status === "draft" ? "Publish" : quiz.status === "live" ? "Mark completed" : "Reopen"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Copy}
                    onClick={() => handleDuplicate(quiz)}
                  >
                    Duplicate
                  </Button>
                  <CopyQuizButton quizId={quiz.id} />
                  <ExportQuizPdfButton quizId={quiz.id} quizTitle={quiz.title} />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    className="text-coral hover:bg-coral/10"
                    onClick={() => setConfirmDelete(quiz)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <button
                onClick={() => navigate(`/admin/landing-quizzes/${quiz.id}`)}
                className="mt-3 block text-left"
              >
                <h3 className="font-display text-base font-semibold text-ink-100 hover:text-electric-soft transition-colors">
                  {quiz.title}
                </h3>
              </button>
              <p className="mt-1 line-clamp-2 text-sm text-ink-500">{quiz.description || "No description"}</p>

              <div className="mt-4 flex items-center justify-between text-xs text-ink-500">
                <span>{quiz.questionCount} questions</span>
                <span>{quiz.durationMinutes} min</span>
                <span>{quiz.participantCount} participants</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <PasteQuizModal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        placement="landing"
        onPasted={() => load()}
      />

      <ImportQuizPdfModal
        open={importPdfOpen}
        onClose={() => setImportPdfOpen(false)}
        placement="landing"
        onImported={() => load()}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete demo quiz?"
        description={`This permanently deletes "${confirmDelete?.title}" along with its questions, attempts and results.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </AdminLayout>
  );
}
