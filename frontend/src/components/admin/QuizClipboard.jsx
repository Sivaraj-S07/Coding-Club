import { useState } from "react";
import { ClipboardCopy, ClipboardPaste, Check, ArrowRight, X } from "lucide-react";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Modal from "../ui/Modal";
import { useToast } from "../ui/Toast";
import { useAdminAuth } from "../../lib/adminAuth";
import { apiFetch, ApiError } from "../../lib/api";
import {
  PLACEMENT_LABELS,
  useQuizClipboard,
  clearQuizClipboard,
  copyQuizToClipboard,
  describeQuizContents,
} from "../../lib/quizClipboard";

// Copy / Paste Quiz UI, shared by Admin -> Quizzes, Admin -> Demo Quizzes and
// the quiz builder. A quiz copied from either list can be pasted into either
// list (Quiz <-> Demo Quiz); the list you paste on decides where the copy lives.

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Copy Quiz" — puts a quiz (with everything inside it) on the clipboard. */
export function CopyQuizButton({ quizId, variant = "ghost", size = "sm", className = "" }) {
  const { token } = useAdminAuth();
  const { push } = useToast();
  const clip = useQuizClipboard();
  const [busy, setBusy] = useState(false);
  const isCopied = clip?.id === quizId;

  const handleCopy = async () => {
    setBusy(true);
    try {
      const entry = await copyQuizToClipboard(token, quizId);
      push(
        `Copied "${entry.title}" (${describeQuizContents(entry)}). Use "Paste Quiz" on the Quizzes or Demo Quizzes page to paste it.`,
        "success"
      );
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to copy quiz", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      icon={isCopied ? Check : ClipboardCopy}
      className={`${isCopied ? "!text-mint" : ""} ${className}`}
      disabled={busy}
      onClick={handleCopy}
      title="Copy this quiz — rounds, questions, answers, marks and settings"
    >
      {busy ? "Copying..." : isCopied ? "Copied" : "Copy Quiz"}
    </Button>
  );
}

/** "Paste Quiz" header button. A green dot shows when something is copied. */
export function PasteQuizButton({ onClick, size = "sm" }) {
  const clip = useQuizClipboard();
  return (
    <Button
      variant="secondary"
      size={size}
      icon={ClipboardPaste}
      onClick={onClick}
      title={clip ? `Paste "${clip.title}"` : "Paste a copied quiz"}
    >
      Paste Quiz
      {clip && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-mint" aria-label="A quiz is ready to paste" />}
    </Button>
  );
}

/** Slim "ready to paste" strip shown above a quiz list while the clipboard holds a quiz. */
export function QuizClipboardBanner({ placement, onPaste }) {
  const clip = useQuizClipboard();
  if (!clip) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-mint/20 bg-mint/5 px-4 py-3">
      <ClipboardCopy className="h-4 w-4 flex-none text-mint" />
      <p className="min-w-0 flex-1 text-xs text-ink-300">
        <span className="font-medium text-ink-100">&ldquo;{clip.title}&rdquo;</span> is copied &middot;{" "}
        {PLACEMENT_LABELS[clip.placement]} &middot; {describeQuizContents(clip)}
      </p>
      <div className="flex gap-2">
        <Button size="sm" icon={ClipboardPaste} onClick={onPaste}>
          Paste as {PLACEMENT_LABELS[placement]}
        </Button>
        <Button size="sm" variant="ghost" icon={X} onClick={() => clearQuizClipboard()}>
          Clear
        </Button>
      </div>
    </div>
  );
}

function EmptyClipboard({ onClose }) {
  return (
    <div>
      <p className="text-sm leading-relaxed text-ink-300">
        Nothing is copied yet. Click <span className="font-medium text-ink-100">Copy Quiz</span> on any quiz — in
        Quizzes or Demo Quizzes — then come back here to paste it.
      </p>
      <div className="mt-6 flex justify-end">
        <Button variant="secondary" size="md" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

// Mounted only while the modal is open, so its state (the editable title)
// starts fresh every time and never needs an effect to reset.
function PasteForm({ clip, placement, onClose, onPasted }) {
  const { token } = useAdminAuth();
  const { push } = useToast();
  const [title, setTitle] = useState(`${clip.title} (Copy)`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handlePaste = async (e) => {
    e.preventDefault();
    const finalTitle = title.trim();
    if (!finalTitle) {
      setError("Give the pasted quiz a title.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch("/admin/quizzes/paste", {
        method: "POST",
        token,
        body: { sourceQuizId: clip.id, placement, title: finalTitle },
      });
      const c = data.copied || {};
      push(
        `Pasted "${data.quiz.title}" as a draft — ${plural(c.rounds ?? 0, "round")}, ${plural(
          c.questions ?? 0,
          "question"
        )} and ${plural(c.options ?? 0, "answer option")}. It keeps the original quiz password.`,
        "success"
      );
      onPasted?.(data);
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to paste quiz";
      // The copied quiz was deleted since it was copied — nothing left to paste.
      if (err instanceof ApiError && err.status === 404) clearQuizClipboard();
      setError(message);
      push(message, "error");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handlePaste} className="space-y-4">
      <div className="glass-card p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Copied quiz</p>
        <p className="mt-1 font-display text-sm font-semibold text-ink-100">{clip.title}</p>
        <p className="mt-1 text-xs text-ink-500">
          {describeQuizContents(clip)} &bull; {plural(clip.optionCount, "answer option")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-300">
        <Badge tone="violet">{PLACEMENT_LABELS[clip.placement]}</Badge>
        <ArrowRight className="h-3.5 w-3.5 text-ink-500" />
        <Badge tone="upcoming">{PLACEMENT_LABELS[placement]}</Badge>
        {clip.placement !== placement && (
          <span className="text-ink-500">
            (copied {clip.placement === "landing" ? "from Demo Quizzes into Quizzes" : "from Quizzes into Demo Quizzes"})
          </span>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-500">
          Title of the pasted quiz
        </label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="glass w-full rounded-xl px-3.5 py-2.5 text-sm text-ink-100 outline-none focus:border-electric/40"
        />
      </div>

      <p className="text-[11px] leading-relaxed text-ink-500">
        Everything is pasted: settings, rounds, questions, answer options, correct answers, marks, negative marks,
        timers and programming test cases. The copy keeps the original quiz password and is created as a{" "}
        <span className="text-ink-300">draft</span>, so nothing goes live until you publish it. Participants, attempts
        and results are not copied.
      </p>

      {error && <p className="text-xs text-coral">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => clearQuizClipboard()} disabled={busy}>
          Clear clipboard
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" size="md" icon={ClipboardPaste} disabled={busy}>
            {busy ? "Pasting..." : "Paste Quiz"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * The Paste Quiz dialog. `placement` is where the pasted copy will live:
 * "quizzes" (Admin -> Quizzes) or "landing" (Admin -> Demo Quizzes).
 * `onPasted(data)` receives the API response ({ quiz, copied, source }).
 */
export function PasteQuizModal({ open, onClose, placement, onPasted }) {
  const clip = useQuizClipboard();
  return (
    <Modal open={open} title="Paste Quiz" onClose={onClose} maxWidth="max-w-md">
      {clip ? (
        <PasteForm key={`${clip.id}:${clip.copiedAt}`} clip={clip} placement={placement} onClose={onClose} onPasted={onPasted} />
      ) : (
        <EmptyClipboard onClose={onClose} />
      )}
    </Modal>
  );
}
