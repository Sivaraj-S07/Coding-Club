import { useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  FileDown,
  FileUp,
  Loader2,
  UploadCloud,
} from "lucide-react";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Modal from "../ui/Modal";
import { useToast } from "../ui/Toast";
import { useAdminAuth } from "../../lib/adminAuth";
import { apiFetch, ApiError } from "../../lib/api";
import { PLACEMENT_LABELS } from "../../lib/quizClipboard";
import { QuizPdfError } from "../../lib/quizPdfFormat";

// Export Quiz as PDF / Import Quiz from PDF UI, shared by Admin -> Quizzes,
// Admin -> Demo Quizzes and the quiz builder.
//
// The PDF (see lib/quizPdfExport.js) holds a readable copy of the quiz plus the
// exact quiz data as an embedded attachment. Import (lib/quizPdfImport.js)
// reads that data, the server validates it with the same rules as the quiz
// builder, and a preview is shown before anything is created.

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Lets React paint a "working" state before a heavy synchronous step starts.
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 30));

function formatWhen(iso) {
  if (!iso) return "Not set";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Not set" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Turns any failure into { message, details[] } fit for showing to an admin. */
function describeError(err, fallback) {
  if (err instanceof QuizPdfError) return { message: err.message, details: [] };
  if (err instanceof ApiError) {
    if (err.status === 413) {
      return { message: "This quiz is too large to import in one go (over 12 MB of data).", details: [] };
    }
    const details = Array.isArray(err.details) ? err.details.filter((d) => typeof d === "string") : [];
    return { message: err.message, details };
  }
  return { message: fallback, details: [] };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

// Mounted only while the dialog is open, so the typed password never lingers.
function ExportForm({ quizId, quizTitle, busy, setBusy, onClose }) {
  const { token } = useAdminAuth();
  const { push } = useToast();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);

  const handleExport = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch(`/admin/quizzes/${quizId}/export`, {
        method: "POST",
        token,
        body: password ? { password } : {},
      });
      await nextFrame();
      const { buildQuizPdf, downloadPdf } = await import("../../lib/quizPdfExport.js");
      const built = buildQuizPdf(data.document);
      downloadPdf(built.bytes, built.fileName);

      const stats = data.document.stats || {};
      push(
        `Exported "${data.document.quiz.title}" — ${plural(stats.roundCount ?? 0, "round")}, ${plural(
          stats.questionCount ?? 0,
          "question"
        )}. ${data.passwordIncluded ? "The password is printed in the PDF." : "The password is not printed (it is protected inside the file)."}`,
        "success"
      );
      setBusy(false);
      onClose();
    } catch (err) {
      const { message } = describeError(err, "Failed to export the quiz");
      setError(message);
      push(message, "error");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleExport} className="space-y-4">
      <div className="glass-card p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Quiz</p>
        <p className="mt-1 font-display text-sm font-semibold text-ink-100">{quizTitle || "This quiz"}</p>
      </div>

      <p className="text-xs leading-relaxed text-ink-300">
        The PDF includes the quiz name, timing, rounds, questions, answer options, correct answers, marks and every
        setting. Use <span className="font-medium text-ink-100">Import Quiz from PDF</span> to recreate the whole quiz
        from it later — here or on another portal.
      </p>

      <div>
        <label htmlFor="export-quiz-password" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-500">
          Quiz password <span className="normal-case tracking-normal text-ink-500">(optional)</span>
        </label>
        <div className="relative">
          <input
            id="export-quiz-password"
            type={showPassword ? "text" : "password"}
            autoComplete="off"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Type it to print it in the PDF"
            className="glass w-full rounded-xl py-2.5 pl-3.5 pr-11 text-sm text-ink-100 outline-none focus:border-electric/40"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-white/10 hover:text-ink-100"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
          Quiz passwords are stored as one-way hashes, so they can&apos;t be read back. Type the current password to
          have it printed in the PDF (it&apos;s checked first). Leave it empty to keep it out of the file — the
          imported quiz still gets the <span className="text-ink-300">same password</span> automatically.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-xs text-coral">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="md" icon={busy ? Loader2 : FileDown} disabled={busy}>
          {busy ? "Preparing PDF..." : "Export PDF"}
        </Button>
      </div>
    </form>
  );
}

/** The Export dialog. */
export function ExportQuizPdfModal({ open, onClose, quizId, quizTitle }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} title="Export quiz as PDF" onClose={busy ? undefined : onClose} maxWidth="max-w-md">
      <ExportForm quizId={quizId} quizTitle={quizTitle} busy={busy} setBusy={setBusy} onClose={onClose} />
    </Modal>
  );
}

/** "Export PDF" button (with its own dialog) for one quiz. */
export function ExportQuizPdfButton({ quizId, quizTitle, variant = "ghost", size = "sm", className = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        icon={FileDown}
        className={className}
        onClick={() => setOpen(true)}
        title="Export this quiz as a PDF — name, password, timing, rounds, questions, answers and settings"
      >
        Export PDF
      </Button>
      <ExportQuizPdfModal open={open} onClose={() => setOpen(false)} quizId={quizId} quizTitle={quizTitle} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** "Import Quiz from PDF" header button. */
export function ImportQuizPdfButton({ onClick, size = "sm", variant = "secondary" }) {
  return (
    <Button
      variant={variant}
      size={size}
      icon={FileUp}
      onClick={onClick}
      title="Recreate a whole quiz from a PDF made with Export PDF"
    >
      Import Quiz from PDF
    </Button>
  );
}

function ProblemList({ details }) {
  if (!details?.length) return null;
  return (
    <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-ink-300">
      {details.map((d, i) => (
        <li key={`${i}:${d}`}>{d}</li>
      ))}
    </ul>
  );
}

function Stat({ label, value }) {
  return (
    <div className="glass-card px-3 py-2.5">
      <p className="font-display text-lg font-semibold leading-none text-ink-100">{value}</p>
      <p className="mt-1.5 text-[11px] text-ink-500">{label}</p>
    </div>
  );
}

function passwordNote(source) {
  if (source === "plain") return "Restored from the PDF (it was printed at export).";
  if (source === "hash") return "Same as the original quiz (restored securely from the PDF).";
  return null;
}

// Mounted only while the dialog is open, so it always starts on "choose a file".
function ImportFlow({ placement, setBusy, onClose, onImported }) {
  const { token } = useAdminAuth();
  const { push } = useToast();
  const inputRef = useRef(null);

  const [phase, setPhase] = useState("pick"); // pick | reading | preview | importing | error
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [doc, setDoc] = useState(null);
  const [preview, setPreview] = useState(null);
  const [problem, setProblem] = useState(null); // { message, details }
  const [title, setTitle] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepStatus, setKeepStatus] = useState(false);
  const [formError, setFormError] = useState(null);

  const startOver = () => {
    setPhase("pick");
    setProblem(null);
    setFormError(null);
    setDoc(null);
    setPreview(null);
  };

  const fail = (err, fallback) => {
    setProblem(describeError(err, fallback));
    setPhase("error");
  };

  const handleFile = async (file) => {
    if (!file) return;
    setProblem(null);
    setFormError(null);
    setFileName(file.name);
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setProblem({ message: "Please choose a PDF file (.pdf) created with Export PDF.", details: [] });
      setPhase("error");
      return;
    }

    setPhase("reading");
    setBusy(true);
    try {
      const { readQuizFromPdf } = await import("../../lib/quizPdfImport.js");
      const { document: quizDoc, pageCount: pages } = await readQuizFromPdf(file);
      // Dry run: the server validates everything (same rules as the quiz
      // builder) and returns a preview, without creating anything.
      const data = await apiFetch("/admin/quizzes/import", {
        method: "POST",
        token,
        body: { document: quizDoc, placement, dryRun: true },
      });
      setDoc(quizDoc);
      setPageCount(pages);
      setPreview(data);
      setTitle(data.summary.title);
      setPassword("");
      setKeepStatus(false);
      setPhase("preview");
    } catch (err) {
      fail(err, "Couldn't read this PDF.");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    const summary = preview.summary;
    const finalTitle = title.trim();
    if (!finalTitle) {
      setFormError("Give the imported quiz a title.");
      return;
    }
    if (summary.passwordSource === "none" && !password) {
      setFormError("This PDF was exported without a password. Enter one for the imported quiz.");
      return;
    }
    setFormError(null);
    setPhase("importing");
    setBusy(true);
    try {
      const data = await apiFetch("/admin/quizzes/import", {
        method: "POST",
        token,
        body: {
          document: doc,
          placement,
          title: finalTitle,
          status: keepStatus ? "keep" : "draft",
          ...(password ? { password } : {}),
        },
      });
      const done = data.imported || {};
      push(
        `Imported "${data.quiz.title}" as ${data.quiz.status === "draft" ? "a draft" : `a ${data.quiz.status} quiz`} — ${plural(
          done.rounds ?? 0,
          "round"
        )}, ${plural(done.questions ?? 0, "question")} and ${plural(done.options ?? 0, "answer option")}.`,
        "success"
      );
      setBusy(false);
      onImported?.(data);
      onClose();
    } catch (err) {
      const shown = describeError(err, "Failed to import the quiz");
      setFormError([shown.message, ...shown.details].join(" "));
      push(shown.message, "error");
      setBusy(false);
      setPhase("preview");
    }
  };

  // ---- choose a file ----
  if (phase === "pick") {
    return (
      <div className="space-y-4">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-within:border-electric/60 ${
            dragging ? "border-electric/60 bg-electric/5" : "border-white/15 hover:border-electric/40 hover:bg-white/[0.03]"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // choosing the same file again must still fire onChange
              handleFile(file);
            }}
          />
          <UploadCloud className="h-8 w-8 text-electric" />
          <p className="text-sm text-ink-100">
            Drop the quiz PDF here, or <span className="font-medium text-electric underline">browse</span>
          </p>
          <p className="text-xs text-ink-500">Use a PDF created with &ldquo;Export PDF&rdquo; in this portal.</p>
        </label>
        <p className="text-[11px] leading-relaxed text-ink-500">
          The whole quiz is recreated as a new <span className="text-ink-300">{PLACEMENT_LABELS[placement]}</span>:
          settings, rounds, questions, answer options, correct answers, marks, timers and programming test cases.
          You&apos;ll see a preview first; nothing is created until you confirm.
        </p>
        <div className="flex justify-end">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ---- reading / importing ----
  if (phase === "reading" || phase === "importing") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center" role="status" aria-live="polite">
        <Loader2 className="h-7 w-7 animate-spin text-electric" />
        <p className="text-sm text-ink-100">
          {phase === "reading" ? "Reading and checking the PDF..." : "Creating the quiz..."}
        </p>
        <p className="max-w-xs truncate text-xs text-ink-500">{fileName}</p>
      </div>
    );
  }

  // ---- couldn't use the file ----
  if (phase === "error") {
    return (
      <div className="space-y-4">
        <div role="alert" className="rounded-xl border border-coral/30 bg-coral/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-coral" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-100">This PDF can&apos;t be imported</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-300">{problem?.message}</p>
              <ProblemList details={problem?.details} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>
            Close
          </Button>
          <Button size="md" icon={FileUp} onClick={startOver}>
            Choose another file
          </Button>
        </div>
      </div>
    );
  }

  // ---- preview ----
  const summary = preview.summary;
  const types = summary.questionTypes || {};
  const note = passwordNote(summary.passwordSource);
  const statusDiffers = summary.exportedStatus !== "draft";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
        <span className="min-w-0 truncate">{fileName}</span>
        <span>&bull;</span>
        <span>{plural(pageCount, "page")}</span>
        <button type="button" onClick={startOver} className="ml-auto text-electric hover:underline">
          Choose a different file
        </button>
      </div>

      <div>
        <label htmlFor="import-quiz-title" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-500">
          Quiz title
        </label>
        <input
          id="import-quiz-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="glass w-full rounded-xl px-3.5 py-2.5 text-sm text-ink-100 outline-none focus:border-electric/40"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-300">
        <span>Will be created in</span>
        <ArrowRight className="h-3.5 w-3.5 text-ink-500" />
        <Badge tone="upcoming">{PLACEMENT_LABELS[placement]}s</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Rounds" value={summary.roundCount} />
        <Stat label="Questions" value={summary.questionCount} />
        <Stat label="Answer options" value={summary.optionCount} />
        <Stat label="Total marks" value={Number(summary.totalMarks.toFixed(2))} />
      </div>
      <p className="-mt-1 text-[11px] text-ink-500">
        {plural(types.mcq || 0, "multiple choice")} &bull; {plural(types.coding || 0, "programming question")} &bull;{" "}
        {plural(types.fill_blank || 0, "fill-in-the-blank")}
      </p>

      <dl className="glass-card divide-y divide-white/5 text-xs">
        {[
          ["Duration", `${summary.durationMinutes} minutes`],
          ["Starts", formatWhen(summary.startTime)],
          ["Ends", formatWhen(summary.endTime)],
          ["Passing", `${summary.passingPercentage}% of ${summary.maxMarks} marks`],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-3.5 py-2">
            <dt className="text-ink-500">{label}</dt>
            <dd className="text-right text-ink-100">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 px-3.5 py-2">
          <dt className="text-ink-500">Password</dt>
          <dd className="text-right text-ink-100">{note || "Not included in the PDF"}</dd>
        </div>
      </dl>

      {summary.passwordSource === "none" && (
        <div>
          <label htmlFor="import-quiz-password" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-500">
            Password for the imported quiz
          </label>
          <div className="relative">
            <input
              id="import-quiz-password"
              type={showPassword ? "text" : "password"}
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass w-full rounded-xl py-2.5 pl-3.5 pr-11 text-sm text-ink-100 outline-none focus:border-electric/40"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-white/10 hover:text-ink-100"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {statusDiffers && (
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">Status of the imported quiz</legend>
          {[
            [false, "Draft (recommended)", "Nothing goes live until you publish it."],
            [true, `Keep "${summary.exportedStatus}"`, "Restore the status the quiz had when it was exported."],
          ].map(([value, label, hint]) => (
            <label
              key={label}
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-2.5 transition-colors ${
                keepStatus === value ? "border-electric/50 bg-electric/5" : "border-white/10 hover:border-white/20"
              }`}
            >
              <input
                type="radio"
                name="import-status"
                checked={keepStatus === value}
                onChange={() => setKeepStatus(value)}
                className="mt-0.5 accent-[#4DA3FF]"
              />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-ink-100">{label}</span>
                <span className="block text-[11px] text-ink-500">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {preview.warnings?.length > 0 && (
        <div className="rounded-xl border border-amber/30 bg-amber/5 p-3.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber" />
            <ul className="space-y-1 text-xs text-ink-300">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {formError && (
        <p role="alert" className="text-xs text-coral">
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" size="md" onClick={onClose}>
          Cancel
        </Button>
        <Button size="md" icon={FileUp} onClick={handleImport}>
          Import Quiz
        </Button>
      </div>
    </div>
  );
}

/**
 * The Import Quiz from PDF dialog. `placement` is where the new quiz will live:
 * "quizzes" (Admin -> Quizzes) or "landing" (Admin -> Demo Quizzes).
 * `onImported(data)` receives the API response ({ quiz, imported, ... }).
 */
export function ImportQuizPdfModal({ open, onClose, placement = "quizzes", onImported }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} title="Import Quiz from PDF" onClose={busy ? undefined : onClose} maxWidth="max-w-lg">
      <ImportFlow placement={placement} setBusy={setBusy} onClose={onClose} onImported={onImported} />
    </Modal>
  );
}
