import { useEffect, useState } from "react";
import { Brain, Users, Activity, AlertTriangle, MessageCircle, Sparkles, Loader2, Eye } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import Skeleton from "../../components/ui/Skeleton";
import Button from "../../components/ui/Button";
import StudentDetailModal from "../../components/admin/StudentDetailModal";
import { useAdminAuth } from "../../lib/adminAuth";
import { useToast } from "../../components/ui/Toast";
import { apiFetch, ApiError } from "../../lib/api";

const DIFFICULTY = {
  high: { label: "Hard for the class", bar: "bg-coral", text: "text-coral" },
  medium: { label: "Getting tricky", bar: "bg-amber", text: "text-amber" },
  low: { label: "Comfortable", bar: "bg-mint", text: "text-mint" },
  "insufficient-data": { label: "Not enough data", bar: "bg-ink-700", text: "text-ink-500" },
};

function Tile({ icon: Icon, label, value, hint }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500"><Icon className="h-4 w-4 text-electric-light" /> {label}</div>
      <p className="mt-2 font-display text-2xl font-semibold text-ink-100">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export default function AdminLearningInsights() {
  const { token } = useAdminAuth();
  const { push } = useToast();
  const [filters, setFilters] = useState({ department: "", section: "", batch: "" });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    apiFetch(`/admin/learning/overview${qs ? `?${qs}` : ""}`, { token })
      .then((d) => {
        if (!alive) return;
        setError(null);
        setData(d);
        setAiSuggestions(null);
      })
      .catch((err) => alive && setError(err instanceof ApiError ? err : new ApiError("Failed to load learning insights", 0)));
    return () => {
      alive = false;
    };
  }, [filters, token, reloadKey]);

  const generate = async () => {
    setAiBusy(true);
    try {
      const out = await apiFetch("/admin/learning/suggestions", { method: "POST", token, body: filters });
      setAiSuggestions(out);
      if (out.provider === "rules") push("No AI key configured — showing rule-based suggestions.", "info");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Could not generate suggestions", "error");
    } finally {
      setAiBusy(false);
    }
  };

  const select = (key, label, options = []) => (
    <label className="flex items-center gap-2 text-xs text-ink-300">
      {label}
      <select value={filters[key]} onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))} className="field-input !w-auto !py-1.5 text-xs">
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );

  const suggestions = aiSuggestions?.suggestions || data?.suggestions || [];
  const dist = data?.levelDistribution;

  return (
    <AdminLayout title="Learning Insights" subtitle="Where the class is struggling — from adaptive practice, quizzes and AI Tutor questions">
      {error ? (
        <div role="alert" className="glass-card flex items-start gap-3 p-6">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
          <div>
            <p className="text-sm font-semibold text-ink-100">{error.status === 503 ? "AI learning needs a one-time database setup" : "Couldn't load insights"}</p>
            <p className="mt-1 text-sm text-ink-300">{error.message}</p>
          </div>
        </div>
      ) : !data ? (
        <div className="grid gap-4 sm:grid-cols-4"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /></div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            {select("department", "Department", data.filterOptions.department)}
            {select("section", "Section", data.filterOptions.section)}
            {select("batch", "Batch", data.filterOptions.batch)}
            <span className="ml-auto text-xs text-ink-500">AI: {data.ai.provider === "local" ? "built-in (no API key)" : data.ai.provider}</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile icon={Users} label="Learners" value={data.summary.learners} hint={`${data.summary.startedPractice} started practice`} />
            <Tile icon={Activity} label="Active (7 days)" value={data.summary.activeLast7Days} hint={`${data.summary.inactive14Days} inactive 14+ days`} />
            <Tile icon={Brain} label="Avg mastery" value={data.summary.avgMastery === null ? "—" : `${Math.round(data.summary.avgMastery * 100)}%`} hint={`${data.summary.practiceAnswers} practice answers`} />
            <Tile icon={AlertTriangle} label="Need attention" value={data.summary.strugglingCount} hint={`${data.summary.tutorQuestions} tutor questions (30d)`} />
          </div>

          <section className="glass-card p-5" aria-labelledby="sug-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="sug-title" className="flex items-center gap-2 font-display text-base font-semibold text-ink-100"><Sparkles className="h-4 w-4 text-amber" /> Teaching suggestions</h2>
              <Button size="sm" variant="secondary" icon={aiBusy ? Loader2 : Sparkles} onClick={generate} disabled={aiBusy || data.summary.learners === 0}>Refine with AI</Button>
            </div>
            <ul className="mt-3 space-y-2">
              {suggestions.map((s, i) => <li key={i} className="flex gap-2 text-sm text-ink-300"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-electric" />{s}</li>)}
            </ul>
            {aiSuggestions && <p className="mt-2 text-[11px] text-ink-500">Source: {aiSuggestions.provider === "rules" ? "rule-based analysis" : `${aiSuggestions.provider} (aggregate data only — no student names are sent)`}</p>}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="glass-card p-5" aria-labelledby="topics-title">
              <h2 id="topics-title" className="font-display text-base font-semibold text-ink-100">Topic difficulty across the class</h2>
              <ul className="mt-4 space-y-4">
                {data.topics.map((t) => {
                  const d = DIFFICULTY[t.difficulty];
                  return (
                    <li key={t.topicId}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-ink-100">{t.title}</span>
                        <span className={`text-xs font-medium ${d.text}`}>{d.label}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${t.title}: ${t.accuracy === null ? "no data" : Math.round(t.accuracy * 100) + "% accuracy"}`}>
                        <div className={`h-full rounded-full ${d.bar}`} style={{ width: `${t.accuracy === null ? 0 : Math.round(t.accuracy * 100)}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        {t.learners} learner(s) · {t.accuracy === null ? "no answers yet" : `${Math.round(t.accuracy * 100)}% accuracy`} · {t.strugglingCount} struggling · {t.tutorQuestions} tutor questions
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>

            <div className="space-y-6">
              <section className="glass-card p-5" aria-labelledby="dist-title">
                <h2 id="dist-title" className="font-display text-base font-semibold text-ink-100">Learner levels</h2>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[["Not started", dist.notStarted, "text-ink-500"], ["Beginner", dist.beginner, "text-coral"], ["Intermediate", dist.intermediate, "text-amber"], ["Advanced", dist.advanced, "text-mint"]].map(([label, n, tone]) => (
                    <div key={label} className="rounded-xl bg-white/[0.04] p-3"><p className={`font-display text-xl font-semibold ${tone}`}>{n}</p><p className="mt-0.5 text-[11px] text-ink-500">{label}</p></div>
                  ))}
                </div>
              </section>

              <section className="glass-card p-5" aria-labelledby="ask-title">
                <h2 id="ask-title" className="flex items-center gap-2 font-display text-base font-semibold text-ink-100"><MessageCircle className="h-4 w-4 text-electric-light" /> What students ask the AI Tutor</h2>
                {data.tutorTopics.length === 0 ? <p className="mt-3 text-sm text-ink-500">No tutor questions in the last 30 days.</p> : (
                  <ul className="mt-3 space-y-1.5">
                    {data.tutorTopics.map((t) => <li key={t.topicId} className="flex justify-between text-sm text-ink-300"><span>{t.title}</span><span className="text-ink-500">{t.count}</span></li>)}
                    {data.unclassifiedTutorQuestions > 0 && <li className="flex justify-between text-sm text-ink-500"><span>Other</span><span>{data.unclassifiedTutorQuestions}</span></li>}
                  </ul>
                )}
              </section>

              <section className="glass-card p-5" aria-labelledby="hard-title">
                <h2 id="hard-title" className="font-display text-base font-semibold text-ink-100">Most-missed practice questions</h2>
                {data.hardestQuestions.length === 0 ? <p className="mt-3 text-sm text-ink-500">Appears once a question has been answered by at least 3 students.</p> : (
                  <ul className="mt-3 space-y-2">
                    {data.hardestQuestions.map((q) => <li key={q.id} className="text-sm text-ink-300"><span className="text-coral">{Math.round(q.wrongPct * 100)}% wrong</span> · {q.title} ({q.level}) — <span className="text-ink-500">{q.text}</span></li>)}
                  </ul>
                )}
              </section>
            </div>
          </div>

          <section className="glass-card overflow-x-auto" aria-labelledby="str-title">
            <h2 id="str-title" className="p-5 pb-3 font-display text-base font-semibold text-ink-100">Students who need attention</h2>
            {data.strugglingStudents.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-500">No struggling learners detected for this selection.</p> : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-y border-white/[0.06] text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-4 py-2.5">Student</th><th className="px-4 py-2.5">Dept / Sec</th><th className="px-4 py-2.5">Weak topics</th><th className="px-4 py-2.5">Mastery</th><th className="px-4 py-2.5">Last active</th><th className="px-4 py-2.5"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.strugglingStudents.map((s) => (
                    <tr key={s.id} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                      <td className="px-4 py-3"><p className="text-ink-100">{s.name}</p><p className="text-xs text-ink-500">{s.registerNumber || s.email || ""}</p></td>
                      <td className="px-4 py-3 text-ink-300">{[s.department, s.section].filter(Boolean).join(" / ") || "—"}</td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{s.weakTopics.map((w) => <span key={w.topicId} className="rounded-full bg-coral/15 px-2 py-0.5 text-[11px] text-coral">{w.title}</span>)}{s.weakTopics.length === 0 && <span className="text-xs text-ink-500">low overall</span>}</div></td>
                      <td className="px-4 py-3 text-ink-300">{Math.round(s.avgMastery * 100)}%</td>
                      <td className="px-4 py-3 text-xs text-ink-500">{s.lastActive ? new Date(s.lastActive).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" icon={Eye} onClick={() => setViewingId(s.id)}>View</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      <StudentDetailModal studentId={viewingId} onClose={() => setViewingId(null)} token={token} push={push} onDeleted={() => { setViewingId(null); setReloadKey((k) => k + 1); }} />
    </AdminLayout>
  );
}
