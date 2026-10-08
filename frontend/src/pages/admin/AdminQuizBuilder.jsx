import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  GripVertical,
  Save,
  CheckCircle2,
  Code2,
  Layers,
} from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Skeleton from "../../components/ui/Skeleton";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Modal from "../../components/ui/Modal";
import ParticipationTab from "../../components/admin/ParticipationTab";
import {
  CopyQuizButton,
  PasteQuizButton,
  PasteQuizModal,
} from "../../components/admin/QuizClipboard";
import {
  ExportQuizPdfButton,
  ImportQuizPdfButton,
  ImportQuizPdfModal,
} from "../../components/admin/QuizPdfTransfer";
import { useToast } from "../../components/ui/Toast";
import { useAdminAuth } from "../../lib/adminAuth";
import { apiFetch, ApiError } from "../../lib/api";

const TABS = [
  { key: "details", label: "Details" },
  { key: "questions", label: "Questions" },
  { key: "participation", label: "Participation" },
  { key: "settings", label: "Settings" },
];

const LANGUAGE_LABELS = { c: "C", cpp: "C++", java: "Java", python: "Python" };

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-500">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-700">{hint}</p>}
    </div>
  );
}

function inputCls() {
  return "glass w-full rounded-xl px-3.5 py-2.5 text-sm text-ink-100 outline-none focus:border-electric/40";
}

function toLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const NEW_QUIZ_DEFAULTS = {
  details: {
    title: "",
    description: "",
    password: "",
    durationMinutes: 30,
    maxMarks: 0,
    startTime: "",
    endTime: "",
  },
  settings: {
    passingPercentage: 40,
    maxAttempts: 1,
    tabSwitchLimit: 3,
    randomizeQuestions: true,
    randomizeOptions: true,
    autoSubmit: true,
    allowLateJoin: false,
    showLeaderboard: true,
    status: "draft",
  },
};

export default function AdminQuizBuilder() {
  const { quizId } = useParams();
  const location = useLocation();
  const isNew = quizId === "new";
  // This same builder is mounted at both /admin/quizzes/:quizId and
  // /admin/landing-quizzes/:quizId — the URL prefix tells us which list a
  // brand-new quiz belongs to and which list "Back" should return to.
  const isLandingContext = location.pathname.startsWith("/admin/landing-quizzes");
  const backPath = isLandingContext ? "/admin/landing-quizzes" : "/admin/quizzes";
  const { token } = useAdminAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState("details");
  const [loading, setLoading] = useState(!isNew);
  const [quiz, setQuiz] = useState(null);
  const [detailsForm, setDetailsForm] = useState(isNew ? NEW_QUIZ_DEFAULTS.details : null);
  const [savingDetails, setSavingDetails] = useState(false);

  const [questions, setQuestions] = useState([]);
  const [questionsLoading, setQuestionsLoading] = useState(!isNew);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [confirmDeleteQ, setConfirmDeleteQ] = useState(null);
  const [questionRoundId, setQuestionRoundId] = useState(null);

  const [rounds, setRounds] = useState([]);
  const [roundsEnabled, setRoundsEnabled] = useState(true);
  const [qualificationEnabled, setQualificationEnabled] = useState(true);
  const [roundModalOpen, setRoundModalOpen] = useState(false);
  const [editingRound, setEditingRound] = useState(null);
  const [confirmDeleteRound, setConfirmDeleteRound] = useState(null);

  const [settingsForm, setSettingsForm] = useState(isNew ? NEW_QUIZ_DEFAULTS.settings : null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [importPdfOpen, setImportPdfOpen] = useState(false);

  const loadQuiz = async () => {
    if (isNew) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch(`/admin/quizzes/${quizId}`, { token });
      setQuiz(data.quiz);
      setDetailsForm({
        title: data.quiz.title,
        description: data.quiz.description || "",
        password: "",
        durationMinutes: data.quiz.durationMinutes,
        maxMarks: data.quiz.maxMarks,
        startTime: toLocalInputValue(data.quiz.startTime),
        endTime: toLocalInputValue(data.quiz.endTime),
      });
      setSettingsForm({
        passingPercentage: data.quiz.passingPercentage,
        maxAttempts: data.quiz.maxAttempts,
        tabSwitchLimit: data.quiz.tabSwitchLimit,
        randomizeQuestions: data.quiz.randomizeQuestions,
        randomizeOptions: data.quiz.randomizeOptions,
        autoSubmit: data.quiz.autoSubmit,
        allowLateJoin: data.quiz.allowLateJoin,
        showLeaderboard: data.quiz.showLeaderboard,
        status: data.quiz.status,
      });
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to load quiz", "error");
      navigate(backPath);
    } finally {
      setLoading(false);
    }
  };

  const loadQuestions = async () => {
    if (isNew) {
      setQuestionsLoading(false);
      return;
    }
    setQuestionsLoading(true);
    try {
      const data = await apiFetch(`/admin/quizzes/${quizId}/questions`, { token });
      setQuestions(data.questions);
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to load questions", "error");
    } finally {
      setQuestionsLoading(false);
    }
  };

  const loadRounds = async () => {
    if (isNew) return;
    try {
      const data = await apiFetch(`/admin/quizzes/${quizId}/rounds`, { token });
      setRounds(data.rounds || []);
      setRoundsEnabled(data.supported !== false);
      setQualificationEnabled(data.qualificationSupported !== false);
    } catch {
      setRounds([]);
    }
  };

  useEffect(() => {
    loadQuiz();
    loadQuestions();
    loadRounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId, token]);

  const saveDetails = async (e) => {
    e.preventDefault();
    if (isNew && !detailsForm.password) {
      push("Set a quiz password before creating the quiz.", "warning");
      return;
    }
    setSavingDetails(true);
    try {
      const body = {
        title: detailsForm.title,
        description: detailsForm.description,
        durationMinutes: Number(detailsForm.durationMinutes),
        maxMarks: Number(detailsForm.maxMarks),
        startTime: detailsForm.startTime ? new Date(detailsForm.startTime).toISOString() : null,
        endTime: detailsForm.endTime ? new Date(detailsForm.endTime).toISOString() : null,
      };
      if (detailsForm.password) body.password = detailsForm.password;
      if (isNew) body.placement = isLandingContext ? "landing" : "quizzes";

      if (isNew) {
        const data = await apiFetch("/admin/quizzes", { method: "POST", token, body });
        push("Quiz created. Now add your questions.", "success");
        navigate(`${backPath}/${data.quiz.id}`, { replace: true });
        return;
      }

      const data = await apiFetch(`/admin/quizzes/${quizId}`, { method: "PUT", token, body });
      setQuiz(data.quiz);
      push("Details saved.", "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to save details", "error");
    } finally {
      setSavingDetails(false);
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const data = await apiFetch(`/admin/quizzes/${quizId}`, {
        method: "PUT",
        token,
        body: {
          passingPercentage: Number(settingsForm.passingPercentage),
          maxAttempts: Number(settingsForm.maxAttempts),
          tabSwitchLimit: Number(settingsForm.tabSwitchLimit),
          randomizeQuestions: settingsForm.randomizeQuestions,
          randomizeOptions: settingsForm.randomizeOptions,
          autoSubmit: settingsForm.autoSubmit,
          allowLateJoin: settingsForm.allowLateJoin,
          showLeaderboard: settingsForm.showLeaderboard,
          status: settingsForm.status,
        },
      });
      setQuiz(data.quiz);
      push("Settings saved.", "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to save settings", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const deleteRound = async () => {
    if (!confirmDeleteRound) return;
    try {
      await apiFetch(`/admin/rounds/${confirmDeleteRound.id}`, { method: "DELETE", token });
      push("Round deleted. Its questions moved to Unassigned.", "success");
      setConfirmDeleteRound(null);
      loadRounds();
      loadQuestions();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to delete round", "error");
    }
  };

  const openQuestionModal = (roundId, question = null) => {
    setQuestionRoundId(roundId ?? null);
    setEditingQuestion(question);
    setQuestionModalOpen(true);
  };

  // Questions are shown round-by-round; anything without a round falls into
  // the "Unassigned" group so nothing can ever be hidden from the admin.
  const groupedQuestions = [
    ...rounds.map((r) => ({ round: r, items: questions.filter((q) => q.roundId === r.id) })),
    { round: null, items: questions.filter((q) => !q.roundId || !rounds.some((r) => r.id === q.roundId)) },
  ].filter((g) => g.round || g.items.length);

  const deleteQuestion = async () => {
    if (!confirmDeleteQ) return;
    try {
      await apiFetch(`/admin/questions/${confirmDeleteQ.id}`, { method: "DELETE", token });
      push("Question deleted.", "success");
      setConfirmDeleteQ(null);
      loadQuestions();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to delete question", "error");
    }
  };

  if (!isNew && (loading || !quiz)) {
    return (
      <AdminLayout title="Loading quiz...">
        <Skeleton className="h-40 rounded-2xl" />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={isNew ? "New quiz" : quiz.title}
      subtitle={
        isNew
          ? "Fill in the details, then save to unlock questions and settings"
          : `${questions.length} question${questions.length === 1 ? "" : "s"} • ${quiz.status}`
      }
      actions={
        <>
          {isNew ? (
            <>
              <ImportQuizPdfButton onClick={() => setImportPdfOpen(true)} />
              <PasteQuizButton onClick={() => setPasteOpen(true)} />
            </>
          ) : (
            <>
              <ExportQuizPdfButton quizId={quizId} quizTitle={quiz.title} variant="secondary" />
              <CopyQuizButton quizId={quizId} variant="secondary" />
            </>
          )}
          <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => navigate(backPath)}>
            Back
          </Button>
        </>
      }
    >
      {isNew && (
        <div className="mb-5 flex items-center gap-2 rounded-xl bg-electric/5 px-4 py-3 text-xs text-ink-500">
          Save the quiz details first — questions and advanced settings unlock right after. Or use Paste Quiz to
          start from a quiz you copied.
        </div>
      )}

      {isNew && (
        <PasteQuizModal
          open={pasteOpen}
          onClose={() => setPasteOpen(false)}
          placement={isLandingContext ? "landing" : "quizzes"}
          onPasted={(data) => navigate(`${backPath}/${data.quiz.id}`, { replace: true })}
        />
      )}

      {isNew && (
        <ImportQuizPdfModal
          open={importPdfOpen}
          onClose={() => setImportPdfOpen(false)}
          placement={isLandingContext ? "landing" : "quizzes"}
          onImported={(data) => navigate(`${backPath}/${data.quiz.id}`, { replace: true })}
        />
      )}

      <div className="mb-5 flex gap-1 rounded-xl glass p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            disabled={isNew && t.key !== "details"}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-electric/15 text-electric-light" : "text-ink-500 hover:text-ink-100"
            } ${isNew && t.key !== "details" ? "cursor-not-allowed opacity-40" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "details" && (
        <form onSubmit={saveDetails} className="glass-card max-w-xl space-y-4 p-6">
          <Field label="Title">
            <input
              className={inputCls()}
              value={detailsForm.title}
              onChange={(e) => setDetailsForm({ ...detailsForm, title: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <textarea
              rows={3}
              className={inputCls()}
              value={detailsForm.description}
              onChange={(e) => setDetailsForm({ ...detailsForm, description: e.target.value })}
            />
          </Field>
          <Field
            label={isNew ? "Quiz password" : "New quiz password"}
            hint={isNew ? "Students will need this password to join." : "Leave blank to keep the current password."}
          >
            <input
              className={inputCls()}
              value={detailsForm.password}
              onChange={(e) => setDetailsForm({ ...detailsForm, password: e.target.value })}
              placeholder="••••••••"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Duration (minutes)">
              <input
                type="number"
                min={1}
                className={inputCls()}
                value={detailsForm.durationMinutes}
                onChange={(e) => setDetailsForm({ ...detailsForm, durationMinutes: e.target.value })}
              />
            </Field>
            <Field label="Max marks" hint={`Sum of question marks: ${questions.reduce((s, q) => s + Number(q.marks), 0)}`}>
              <input
                type="number"
                min={0}
                className={inputCls()}
                value={detailsForm.maxMarks}
                onChange={(e) => setDetailsForm({ ...detailsForm, maxMarks: e.target.value })}
              />
            </Field>
            <Field label="Start time">
              <input
                type="datetime-local"
                className={inputCls()}
                value={detailsForm.startTime}
                onChange={(e) => setDetailsForm({ ...detailsForm, startTime: e.target.value })}
              />
            </Field>
            <Field label="End time">
              <input
                type="datetime-local"
                className={inputCls()}
                value={detailsForm.endTime}
                onChange={(e) => setDetailsForm({ ...detailsForm, endTime: e.target.value })}
              />
            </Field>
          </div>
          <Button type="submit" icon={Save} disabled={savingDetails}>
            {savingDetails ? "Saving..." : "Save details"}
          </Button>
        </form>
      )}

      {tab === "questions" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink-100">Rounds &amp; questions</p>
              <p className="text-xs text-ink-500">
                Group questions into rounds — students take them round by round, in order.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                icon={Layers}
                size="sm"
                disabled={!roundsEnabled}
                onClick={() => {
                  setEditingRound(null);
                  setRoundModalOpen(true);
                }}
              >
                Add Round
              </Button>
              <Button icon={Plus} size="sm" onClick={() => openQuestionModal(rounds[0]?.id ?? null)}>
                Add Question
              </Button>
            </div>
          </div>

          {roundsEnabled && !qualificationEnabled && (
            <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
              Round names and descriptions save fine, but qualification percentages need a one-time database update.
              Run <span className="font-mono">backend/sql/migration_rounds_and_notifications.sql</span> in the Supabase
              SQL editor.
            </div>
          )}

          {!roundsEnabled && (
            <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
              Rounds need a one-time database update. Run <span className="font-mono">backend/sql/schema.sql</span> in
              your Supabase SQL editor, then reload this page. Existing questions keep working meanwhile.
            </div>
          )}

          {questionsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : questions.length === 0 && rounds.length === 0 ? (
            <div className="glass-card p-10 text-center text-sm text-ink-500">
              No questions yet. Create a round, then add your first MCQ or programming question.
            </div>
          ) : (
            <div className="space-y-6">
              {groupedQuestions.map((g) => (
                <section key={g.round ? g.round.id : "unassigned"}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-ink-100">
                        <Layers className="h-4 w-4 text-electric-light" />
                        {g.round ? g.round.name : "Unassigned questions"}
                        <Badge tone="violet">
                          {g.items.length} question{g.items.length === 1 ? "" : "s"}
                        </Badge>
                        {g.round && Number(g.round.qualificationPercentage) > 0 && (
                          <Badge tone="upcoming">
                            Qualify: {Number(g.round.qualificationPercentage)}%
                          </Badge>
                        )}
                      </p>
                      {g.round?.description && (
                        <p className="mt-0.5 truncate text-xs text-ink-500">{g.round.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Plus}
                        onClick={() => openQuestionModal(g.round ? g.round.id : null)}
                      >
                        Question
                      </Button>
                      {g.round && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Pencil}
                            onClick={() => {
                              setEditingRound(g.round);
                              setRoundModalOpen(true);
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            onClick={() => setConfirmDeleteRound(g.round)}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {g.items.length === 0 ? (
                    <p className="glass-card p-6 text-center text-xs text-ink-500">
                      No questions in this round yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {g.items.map((q, idx) => (
                <div key={q.id} className="glass-card flex items-start gap-3 p-4">
                  <GripVertical className="mt-1 h-4 w-4 shrink-0 text-ink-700" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-500">Q{idx + 1}</span>
                      <Badge tone="violet">{q.marks} mark{q.marks === 1 ? "" : "s"}</Badge>
                      {q.timeLimitSeconds > 0 && (
                        <Badge tone="upcoming">
                          {q.timeLimitSeconds % 60 === 0
                            ? `${q.timeLimitSeconds / 60} min`
                            : `${q.timeLimitSeconds}s`}{" "}
                          limit
                        </Badge>
                      )}
                      {q.type === "coding" ? (
                        <Badge tone="upcoming">
                          <Code2 className="mr-1 inline h-3 w-3" />
                          {LANGUAGE_LABELS[q.language] || q.language}
                        </Badge>
                      ) : q.type === "fill_blank" ? (
                        <Badge tone="upcoming">Fill in the blank</Badge>
                      ) : null}
                      {q.negativeMarks > 0 && <Badge tone="danger">-{q.negativeMarks} negative</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-ink-100">{q.text}</p>
                    {q.type === "coding" ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-lg bg-white/[0.04] px-2.5 py-1 text-xs text-ink-500">
                          {(q.testCases || []).length > 0
                            ? `Judged against ${(q.testCases || []).length} test case${(q.testCases || []).length === 1 ? "" : "s"}`
                            : `Graded against ${q.expectedOutput ? "expected output" : "reference solution"}`}
                        </span>
                      </div>
                    ) : q.type === "fill_blank" ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(q.blankAnswers || []).map((accepted, i) => (
                          <span
                            key={i}
                            className="flex items-center gap-1 rounded-lg bg-mint/10 px-2.5 py-1 text-xs text-mint"
                          >
                            Blank {i + 1}: {accepted.join(" / ") || "—"}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {q.options.map((o) => (
                          <span
                            key={o.id}
                            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs ${
                              o.isCorrect ? "bg-mint/10 text-mint" : "bg-white/[0.04] text-ink-500"
                            }`}
                          >
                            {o.isCorrect && <CheckCircle2 className="h-3 w-3" />}
                            {o.text}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Pencil}
                      onClick={() => openQuestionModal(g.round ? g.round.id : null, q)}
                    />
                    <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmDeleteQ(q)} />
                  </div>
                </div>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "participation" && <ParticipationTab quizId={quizId} token={token} quizTitle={quiz?.title} />}

      {tab === "settings" && (
        <form onSubmit={saveSettings} className="glass-card max-w-xl space-y-5 p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Passing percentage">
              <input
                type="number"
                min={0}
                max={100}
                className={inputCls()}
                value={settingsForm.passingPercentage}
                onChange={(e) => setSettingsForm({ ...settingsForm, passingPercentage: e.target.value })}
              />
            </Field>
            <Field label="Max attempts">
              <input
                type="number"
                min={1}
                className={inputCls()}
                value={settingsForm.maxAttempts}
                onChange={(e) => setSettingsForm({ ...settingsForm, maxAttempts: e.target.value })}
              />
            </Field>
            <Field
              label="Tab-switch limit"
              hint="Quiz-security violations (screenshots, tab/app switching, leaving the quiz, third-party tabs/sites) always end the attempt on the first occurrence — this limit no longer applies to them. It still applies to any other counted signal."
            >
              <input
                type="number"
                min={0}
                className={inputCls()}
                value={settingsForm.tabSwitchLimit}
                onChange={(e) => setSettingsForm({ ...settingsForm, tabSwitchLimit: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <select
                className={inputCls()}
                value={settingsForm.status}
                onChange={(e) => setSettingsForm({ ...settingsForm, status: e.target.value })}
              >
                <option value="draft">Draft</option>
                <option value="upcoming">Upcoming</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
              </select>
            </Field>
          </div>

          <div className="space-y-3">
            {[
              { key: "randomizeQuestions", label: "Randomize question order", desc: "Each student sees a shuffled question order." },
              { key: "randomizeOptions", label: "Randomize option order", desc: "Each student sees shuffled MCQ options." },
              { key: "autoSubmit", label: "Auto-submit on time up / violation limit", desc: "Quiz submits automatically when time runs out, a quiz-security violation is detected (immediately), or the tab-switch limit is reached. Turning this off disables all automatic logout." },
              { key: "allowLateJoin", label: "Allow late joining", desc: "Students can join after the scheduled end time." },
              { key: "showLeaderboard", label: "Public leaderboard", desc: "Students can view the leaderboard for this quiz." },
            ].map((opt) => (
              <label key={opt.key} className="flex cursor-pointer items-start gap-3 rounded-xl glass p-3.5">
                <input
                  type="checkbox"
                  checked={settingsForm[opt.key]}
                  onChange={(e) => setSettingsForm({ ...settingsForm, [opt.key]: e.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-electric"
                />
                <div>
                  <p className="text-sm font-medium text-ink-100">{opt.label}</p>
                  <p className="text-xs text-ink-500">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          <Button type="submit" icon={Save} disabled={savingSettings}>
            {savingSettings ? "Saving..." : "Save settings"}
          </Button>
        </form>
      )}

      <QuestionModal
        open={questionModalOpen}
        onClose={() => setQuestionModalOpen(false)}
        quizId={quizId}
        token={token}
        question={editingQuestion}
        rounds={rounds}
        roundsEnabled={roundsEnabled}
        defaultRoundId={questionRoundId}
        onSaved={() => {
          setQuestionModalOpen(false);
          loadQuestions();
          loadRounds();
        }}
      />

      <RoundModal
        open={roundModalOpen}
        onClose={() => setRoundModalOpen(false)}
        quizId={quizId}
        token={token}
        round={editingRound}
        onSaved={() => {
          setRoundModalOpen(false);
          loadRounds();
        }}
      />

      <ConfirmDialog
        open={!!confirmDeleteRound}
        title="Delete this round?"
        description="The round is removed. Its questions are kept and moved to Unassigned."
        confirmLabel="Delete round"
        onConfirm={deleteRound}
        onCancel={() => setConfirmDeleteRound(null)}
      />

      <ConfirmDialog
        open={!!confirmDeleteQ}
        title="Delete this question?"
        description="This will permanently remove the question and its options."
        confirmLabel="Delete"
        onConfirm={deleteQuestion}
        onCancel={() => setConfirmDeleteQ(null)}
      />
    </AdminLayout>
  );
}

function QuestionModal({ open, onClose, quizId, token, question, onSaved, rounds = [], roundsEnabled = true, defaultRoundId = null }) {
  const { push } = useToast();
  const [type, setType] = useState("mcq");
  const [text, setText] = useState("");
  const [marks, setMarks] = useState(1);
  const [negativeMarks, setNegativeMarks] = useState(0);
  const [options, setOptions] = useState([
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
  ]);
  const [language, setLanguage] = useState("python");
  const [starterCode, setStarterCode] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");
  const [referenceSolution, setReferenceSolution] = useState("");
  // LeetCode-style problem definition
  const [problemStatement, setProblemStatement] = useState("");
  const [inputFormat, setInputFormat] = useState("");
  const [outputFormat, setOutputFormat] = useState("");
  const [constraintsText, setConstraintsText] = useState("");
  const [sampleIo, setSampleIo] = useState([{ input: "", output: "", explanation: "" }]);
  const [testCases, setTestCases] = useState([{ input: "", expectedOutput: "", hidden: true }]);
  const [execTimeLimitMs, setExecTimeLimitMs] = useState(3000);
  const [allowedLanguages, setAllowedLanguages] = useState([]);
  const [blanksText, setBlanksText] = useState([""]);
  const [caseSensitive, setCaseSensitive] = useState(false);
  // Per-question time limit, entered in seconds or minutes ("" = no limit).
  const [timeLimitValue, setTimeLimitValue] = useState("");
  const [timeLimitUnit, setTimeLimitUnit] = useState("seconds");
  const [saving, setSaving] = useState(false);
  const [roundId, setRoundId] = useState("");

  useEffect(() => {
    if (open) {
      setRoundId(question ? question.roundId || "" : defaultRoundId || "");
      if (question) {
        setType(question.type || "mcq");
        setText(question.text);
        setMarks(question.marks);
        setNegativeMarks(question.negativeMarks);
        setOptions(
          question.options.length
            ? question.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect }))
            : [
                { text: "", isCorrect: true },
                { text: "", isCorrect: false },
              ]
        );
        setLanguage(question.language || "python");
        setStarterCode(question.starterCode || "");
        setExpectedOutput(question.expectedOutput || "");
        setReferenceSolution(question.referenceSolution || "");
        setProblemStatement(question.problemStatement || "");
        setInputFormat(question.inputFormat || "");
        setOutputFormat(question.outputFormat || "");
        setConstraintsText(question.constraintsText || "");
        setSampleIo(
          question.sampleIo && question.sampleIo.length
            ? question.sampleIo.map((x) => ({
                input: x.input || "",
                output: x.output || "",
                explanation: x.explanation || "",
              }))
            : [{ input: "", output: "", explanation: "" }]
        );
        setTestCases(
          question.testCases && question.testCases.length
            ? question.testCases.map((t) => ({
                input: t.input || "",
                expectedOutput: t.expectedOutput || "",
                hidden: t.hidden !== false,
              }))
            : [{ input: "", expectedOutput: "", hidden: true }]
        );
        setExecTimeLimitMs(Number(question.timeLimitMs || 3000));
        setAllowedLanguages(question.allowedLanguages || []);
        setBlanksText(
          question.blankAnswers && question.blankAnswers.length
            ? question.blankAnswers.map((accepted) => (accepted || []).join(", "))
            : [""]
        );
        setCaseSensitive(!!question.caseSensitive);
        const limit = Number(question.timeLimitSeconds || 0);
        if (limit > 0 && limit % 60 === 0) {
          setTimeLimitUnit("minutes");
          setTimeLimitValue(String(limit / 60));
        } else {
          setTimeLimitUnit("seconds");
          setTimeLimitValue(limit > 0 ? String(limit) : "");
        }
      } else {
        setType("mcq");
        setText("");
        setMarks(1);
        setNegativeMarks(0);
        setOptions([
          { text: "", isCorrect: true },
          { text: "", isCorrect: false },
        ]);
        setLanguage("python");
        setStarterCode("");
        setExpectedOutput("");
        setReferenceSolution("");
        setBlanksText([""]);
        setCaseSensitive(false);
        setTimeLimitValue("");
        setTimeLimitUnit("seconds");
      }
    }
  }, [open, question, defaultRoundId]);

  const updateOption = (idx, patch) => {
    setOptions((opts) => opts.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  const setCorrect = (idx) => {
    setOptions((opts) => opts.map((o, i) => ({ ...o, isCorrect: i === idx })));
  };

  const addOption = () => setOptions((opts) => [...opts, { text: "", isCorrect: false }]);
  const removeOption = (idx) =>
    setOptions((opts) => (opts.length <= 2 ? opts : opts.filter((_, i) => i !== idx)));

  const updateBlankText = (idx, value) =>
    setBlanksText((blanks) => blanks.map((b, i) => (i === idx ? value : b)));
  const addBlank = () => setBlanksText((blanks) => [...blanks, ""]);
  const removeBlank = (idx) =>
    setBlanksText((blanks) => (blanks.length <= 1 ? blanks : blanks.filter((_, i) => i !== idx)));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return push("Question text is required.", "warning");

    let body;
    if (type === "mcq") {
      if (options.some((o) => !o.text.trim())) return push("All options need text.", "warning");
      if (!options.some((o) => o.isCorrect)) return push("Select the correct option.", "warning");
      body = { type: "mcq", text, marks: Number(marks), negativeMarks: Number(negativeMarks), options };
    } else if (type === "coding") {
      const cleanTests = testCases
        .map((t) => ({
          input: t.input,
          expectedOutput: t.expectedOutput,
          hidden: t.hidden !== false,
        }))
        .filter((t) => t.expectedOutput.trim() !== "" || t.input.trim() !== "");
      const cleanSamples = sampleIo.filter((x) => x.input.trim() !== "" || x.output.trim() !== "");
      if (!cleanTests.length && !expectedOutput.trim() && !referenceSolution.trim()) {
        return push("Add at least one hidden test case to grade submissions against.", "warning");
      }
      if (cleanTests.some((t) => !t.expectedOutput.trim())) {
        return push("Every test case needs an expected output.", "warning");
      }
      body = {
        type: "coding",
        text,
        marks: Number(marks),
        negativeMarks: Number(negativeMarks),
        language,
        starterCode,
        expectedOutput,
        referenceSolution,
        problemStatement,
        inputFormat,
        outputFormat,
        constraintsText,
        sampleIo: cleanSamples,
        testCases: cleanTests,
        timeLimitMs: Number(execTimeLimitMs) || 3000,
        allowedLanguages: allowedLanguages.length ? allowedLanguages : [language],
      };
    } else {
      const blankAnswers = blanksText.map((b) =>
        b.split(",").map((a) => a.trim()).filter(Boolean)
      );
      if (blankAnswers.some((accepted) => accepted.length === 0)) {
        return push("Every blank needs at least one accepted answer.", "warning");
      }
      body = {
        type: "fill_blank",
        text,
        marks: Number(marks),
        negativeMarks: Number(negativeMarks),
        blankAnswers,
        caseSensitive,
      };
    }

    const rawLimit = String(timeLimitValue).trim();
    if (rawLimit !== "" && (!Number.isFinite(Number(rawLimit)) || Number(rawLimit) < 0)) {
      return push("Time limit must be a positive number (or empty for no limit).", "warning");
    }
    const limitSeconds =
      rawLimit === "" || Number(rawLimit) <= 0
        ? null
        : Math.round(Number(rawLimit) * (timeLimitUnit === "minutes" ? 60 : 1));
    if (limitSeconds !== null && limitSeconds > 7200) {
      return push("Time limit cannot exceed 2 hours for a single question.", "warning");
    }
    body.timeLimitSeconds = limitSeconds;

    if (roundsEnabled) body.roundId = roundId || null;

    setSaving(true);
    try {
      let saved;
      if (question) {
        saved = await apiFetch(`/admin/questions/${question.id}`, { method: "PUT", token, body });
        push("Question updated.", "success");
      } else {
        saved = await apiFetch(`/admin/quizzes/${quizId}/questions`, { method: "POST", token, body });
        push("Question added.", "success");
      }
      // The per-question countdown needs questions.time_limit_seconds; warn
      // loudly instead of silently dropping the admin's chosen limit.
      if (limitSeconds && saved && saved.timeLimitApplied === false) {
        push("Time limit not saved — run backend/sql/schema.sql to enable per-question timers.", "warning");
      }
      onSaved();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to save question", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={question ? "Edit question" : "Add question"}
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!question && (
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-500">
              Question type
            </label>
            <div className="flex gap-1 rounded-xl glass p-1 w-fit">
              {[
                { key: "mcq", label: "Multiple choice" },
                { key: "coding", label: "Programming" },
                { key: "fill_blank", label: "Fill in the blank" },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setType(t.key)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    type === t.key ? "bg-electric/15 text-electric-light" : "text-ink-500 hover:text-ink-100"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {question && (
          <Badge tone={type === "mcq" ? "violet" : "upcoming"}>
            {type === "coding"
              ? `Programming — ${LANGUAGE_LABELS[language] || language}`
              : type === "fill_blank"
              ? "Fill in the blank"
              : "Multiple choice"}
          </Badge>
        )}

        {roundsEnabled && rounds.length > 0 && (
          <Field label="Round" hint="Which round this question belongs to.">
            <select className={inputCls()} value={roundId} onChange={(e) => setRoundId(e.target.value)}>
              <option value="">Unassigned</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={type === "coding" ? "Problem statement" : "Question text"}>
          <textarea rows={type === "coding" ? 3 : 2} className={inputCls()} value={text} onChange={(e) => setText(e.target.value)} />
          {type === "fill_blank" && (
            <p className="mt-1 text-[11px] text-ink-700">
              Mark each blank with an underscore, e.g. "The capital of France is ___".
            </p>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Marks">
            <input type="number" min={1} className={inputCls()} value={marks} onChange={(e) => setMarks(e.target.value)} />
          </Field>
          {(
            <Field label="Negative marks" hint="Deducted only for a wrong (non-blank) answer. Applies to MCQ, programming and fill-in-the-blank.">
              <input
                type="number"
                min={0}
                className={inputCls()}
                value={negativeMarks}
                onChange={(e) => setNegativeMarks(e.target.value)}
              />
            </Field>
          )}
          {type === "coding" && (
            <Field label="Language">
              <select className={inputCls()} value={language} onChange={(e) => setLanguage(e.target.value)}>
                {Object.entries(LANGUAGE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {type === "fill_blank" && (
            <Field label="Case sensitive" hint="Off = 'Paris' matches 'paris'.">
              <label className="glass flex h-[42px] w-full cursor-pointer items-center gap-2 rounded-xl px-3.5 text-sm text-ink-100">
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(e) => setCaseSensitive(e.target.checked)}
                  className="h-4 w-4 accent-electric"
                />
                Match exact case
              </label>
            </Field>
          )}
        </div>

        <Field
          label="Time limit for this question"
          hint="Leave empty (or 0) for no per-question limit — only the overall quiz timer applies."
        >
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step={timeLimitUnit === "minutes" ? 0.5 : 1}
              placeholder="No limit"
              className={inputCls()}
              value={timeLimitValue}
              onChange={(e) => setTimeLimitValue(e.target.value)}
            />
            <select
              className={`${inputCls()} w-36`}
              value={timeLimitUnit}
              onChange={(e) => setTimeLimitUnit(e.target.value)}
            >
              <option value="seconds">Seconds</option>
              <option value="minutes">Minutes</option>
            </select>
          </div>
        </Field>

        {type === "mcq" ? (
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-500">
              Options — select the correct one
            </label>
            <div className="space-y-2">
              {options.map((o, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct-option"
                    checked={o.isCorrect}
                    onChange={() => setCorrect(idx)}
                    className="h-4 w-4 accent-mint"
                  />
                  <input
                    className={inputCls()}
                    value={o.text}
                    onChange={(e) => updateOption(idx, { text: e.target.value })}
                    placeholder={`Option ${idx + 1}`}
                  />
                  {options.length > 2 && (
                    <button type="button" onClick={() => removeOption(idx)} className="shrink-0 text-ink-500 hover:text-coral">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addOption}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-electric-light hover:text-electric"
            >
              <Plus className="h-3.5 w-3.5" /> Add option
            </button>
          </div>
        ) : type === "coding" ? (
          <div className="space-y-4">
            <Field label="Starter code" hint="Optional — shown to students as a starting point.">
              <textarea
                rows={4}
                spellCheck={false}
                className={`${inputCls()} font-mono`}
                value={starterCode}
                onChange={(e) => setStarterCode(e.target.value)}
                placeholder={`// ${LANGUAGE_LABELS[language]} starter code (optional)`}
              />
            </Field>
            <Field
              label="Expected output"
              hint="What the program should print. Used to auto-grade submissions."
            >
              <textarea
                rows={3}
                spellCheck={false}
                className={`${inputCls()} font-mono`}
                value={expectedOutput}
                onChange={(e) => setExpectedOutput(e.target.value)}
              />
            </Field>
            <Field
              label="Reference solution"
              hint="Optional model answer — improves partial-credit grading when the student's code is close but not exact."
            >
              <textarea
                rows={5}
                spellCheck={false}
                className={`${inputCls()} font-mono`}
                value={referenceSolution}
                onChange={(e) => setReferenceSolution(e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Input format" hint="How the input is provided on stdin.">
                <textarea rows={2} className={inputCls()} value={inputFormat} onChange={(e) => setInputFormat(e.target.value)} />
              </Field>
              <Field label="Output format" hint="What the program must print.">
                <textarea rows={2} className={inputCls()} value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} />
              </Field>
            </div>

            <Field label="Detailed problem statement" hint="Optional — shown above the editor, in addition to the question text.">
              <textarea rows={4} className={inputCls()} value={problemStatement} onChange={(e) => setProblemStatement(e.target.value)} />
            </Field>

            <Field label="Constraints" hint="e.g. 1 <= N <= 10^5">
              <textarea rows={2} className={inputCls()} value={constraintsText} onChange={(e) => setConstraintsText(e.target.value)} />
            </Field>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-500">
                Sample input / output — visible to students
              </label>
              <div className="space-y-2">
                {sampleIo.map((sample, idx) => (
                  <div key={idx} className="glass space-y-2 rounded-xl p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <textarea
                        rows={2}
                        spellCheck={false}
                        placeholder="Sample input"
                        className={`${inputCls()} font-mono`}
                        value={sample.input}
                        onChange={(e) => setSampleIo((list) => list.map((x, i) => (i === idx ? { ...x, input: e.target.value } : x)))}
                      />
                      <textarea
                        rows={2}
                        spellCheck={false}
                        placeholder="Sample output"
                        className={`${inputCls()} font-mono`}
                        value={sample.output}
                        onChange={(e) => setSampleIo((list) => list.map((x, i) => (i === idx ? { ...x, output: e.target.value } : x)))}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        placeholder="Explanation (optional)"
                        className={inputCls()}
                        value={sample.explanation}
                        onChange={(e) => setSampleIo((list) => list.map((x, i) => (i === idx ? { ...x, explanation: e.target.value } : x)))}
                      />
                      {sampleIo.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSampleIo((list) => list.filter((_, i) => i !== idx))}
                          className="text-ink-500 hover:text-coral"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSampleIo((list) => [...list, { input: "", output: "", explanation: "" }])}
                className="mt-2 flex items-center gap-1 text-xs font-medium text-electric-light hover:text-electric"
              >
                <Plus className="h-3.5 w-3.5" /> Add sample
              </button>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-500">
                Test cases — used for grading
              </label>
              <div className="space-y-2">
                {testCases.map((test, idx) => (
                  <div key={idx} className="glass space-y-2 rounded-xl p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <textarea
                        rows={2}
                        spellCheck={false}
                        placeholder="Input (stdin)"
                        className={`${inputCls()} font-mono`}
                        value={test.input}
                        onChange={(e) => setTestCases((list) => list.map((x, i) => (i === idx ? { ...x, input: e.target.value } : x)))}
                      />
                      <textarea
                        rows={2}
                        spellCheck={false}
                        placeholder="Expected output"
                        className={`${inputCls()} font-mono`}
                        value={test.expectedOutput}
                        onChange={(e) =>
                          setTestCases((list) => list.map((x, i) => (i === idx ? { ...x, expectedOutput: e.target.value } : x)))
                        }
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-300">
                        <input
                          type="checkbox"
                          checked={test.hidden !== false}
                          onChange={(e) => setTestCases((list) => list.map((x, i) => (i === idx ? { ...x, hidden: e.target.checked } : x)))}
                          className="h-4 w-4 accent-electric"
                        />
                        Hidden from students
                      </label>
                      {testCases.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setTestCases((list) => list.filter((_, i) => i !== idx))}
                          className="ml-auto text-ink-500 hover:text-coral"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setTestCases((list) => [...list, { input: "", expectedOutput: "", hidden: true }])}
                className="mt-2 flex items-center gap-1 text-xs font-medium text-electric-light hover:text-electric"
              >
                <Plus className="h-3.5 w-3.5" /> Add test case
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Execution time limit (ms)" hint="Per test case. 500–99999.">
                <input
                  type="number"
                  min={500}
                  max={99999}
                  step={100}
                  className={inputCls()}
                  value={execTimeLimitMs}
                  onChange={(e) => setExecTimeLimitMs(e.target.value)}
                />
              </Field>
              <Field label="Languages students may use" hint="None selected = the language chosen above.">
                <div className="glass flex flex-wrap items-center gap-3 rounded-xl px-3.5 py-2.5">
                  {Object.entries(LANGUAGE_LABELS).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-200">
                      <input
                        type="checkbox"
                        checked={allowedLanguages.includes(key)}
                        onChange={(e) =>
                          setAllowedLanguages((list) =>
                            e.target.checked ? [...list, key] : list.filter((l) => l !== key)
                          )
                        }
                        className="h-4 w-4 accent-electric"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </Field>
            </div>

            <p className="text-[11px] text-ink-700">
              Submissions run in a sandboxed judge against every test case above. Marks are awarded in
              proportion to the test cases passed, hardcoded outputs are rejected, and negative marks apply
              when no test case passes.
            </p>
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-500">
              Blanks — accepted answers
            </label>
            <div className="space-y-2">
              {blanksText.map((b, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-xs text-ink-500">Blank {idx + 1}</span>
                  <input
                    className={inputCls()}
                    value={b}
                    onChange={(e) => updateBlankText(idx, e.target.value)}
                    placeholder="Accepted answers, comma-separated (e.g. Paris, paris)"
                  />
                  {blanksText.length > 1 && (
                    <button type="button" onClick={() => removeBlank(idx)} className="shrink-0 text-ink-500 hover:text-coral">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addBlank}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-electric-light hover:text-electric"
            >
              <Plus className="h-3.5 w-3.5" /> Add another blank
            </button>
            <p className="mt-2 text-[11px] text-ink-700">
              Add one row per blank, in the same order they appear in the question text. List every
              acceptable answer for a blank separated by commas — any one of them will be marked correct.
            </p>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Saving..." : question ? "Save changes" : "Add question"}
        </Button>
      </form>
    </Modal>
  );
}

function RoundModal({ open, onClose, quizId, token, round, onSaved }) {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [qualification, setQualification] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(round?.name || "");
    setDescription(round?.description || "");
    setQualification(String(round?.qualificationPercentage ?? 0));
  }, [open, round]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return push("Round name is required.", "warning");
    const qualificationPercentage = qualification === "" ? 0 : Number(qualification);
    if (!Number.isFinite(qualificationPercentage) || qualificationPercentage < 0 || qualificationPercentage > 100) {
      return push("Qualification percentage must be between 0 and 100.", "warning");
    }
    setSaving(true);
    try {
      if (round) {
        const res = await apiFetch(`/admin/rounds/${round.id}`, {
          method: "PUT",
          token,
          body: { name: name.trim(), description: description.trim(), qualificationPercentage },
        });
        if (res?.warning) push(res.warning, "warning");
        else push("Round updated.", "success");
      } else {
        await apiFetch(`/admin/quizzes/${quizId}/rounds`, {
          method: "POST",
          token,
          body: { name: name.trim(), description: description.trim(), qualificationPercentage },
        });
        push("Round created.", "success");
      }
      onSaved();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to save round", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={round ? "Edit round" : "Add round"} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Round name">
          <input
            className={inputCls()}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Round 1 — Aptitude"
          />
        </Field>
        <Field label="Description" hint="Optional — shown to you in the builder.">
          <textarea
            rows={2}
            className={inputCls()}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field
          label="Qualification percentage"
          hint="Minimum % of this round a student must answer correctly to move to the next round. 0 = no gate. Example: 10 questions at 50% means at least 5 correct."
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              className={inputCls()}
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
              placeholder="0"
            />
            <span className="text-sm text-ink-500">%</span>
          </div>
        </Field>
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Saving..." : round ? "Save changes" : "Create round"}
        </Button>
      </form>
    </Modal>
  );
}
