import { useEffect, useState } from "react";
import { Brain } from "lucide-react";
import Skeleton from "../ui/Skeleton";
import { apiFetch, ApiError } from "../../lib/api";

const LEVEL_TONE = { easy: "text-mint", medium: "text-amber", hard: "text-coral" };

/**
 * "AI learning" section inside the admin Student detail modal: this student's
 * topic mastery, weak topics (from adaptive practice + quiz results) and what
 * they ask the AI Tutor about. Read-only.
 */
export default function LearningInsightsPanel({ studentId, token }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    let alive = true;
    apiFetch(`/admin/learning/students/${studentId}`, { token })
      .then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((err) => alive && setState({ loading: false, data: null, error: err instanceof ApiError ? err.message : "Failed to load learning insights" }));
    return () => {
      alive = false;
    };
  }, [studentId, token]);

  const { loading, data, error } = state;
  const titles = data?.topicTitles || {};

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
        <Brain className="h-4 w-4 text-violet-soft" /> AI learning insights
      </h3>
      {loading ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : error ? (
        <p className="rounded-xl border border-white/[0.06] p-3 text-xs text-ink-500">{error}</p>
      ) : (
        <div className="space-y-3 rounded-xl border border-white/[0.06] p-3">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-300">
            <span>Overall: <strong className="capitalize text-ink-100">{data.recommendations.overall.key.replace("-", " ")}</strong>{data.recommendations.overall.mastery > 0 && ` (${Math.round(data.recommendations.overall.mastery * 100)}%)`}</span>
            {data.profile && <span>Level {data.profile.level} · {data.profile.xp} XP · {data.profile.streakDays}-day streak</span>}
          </div>

          <ul className="space-y-1.5">
            {data.recommendations.topics.map((t) => (
              <li key={t.topicId} className="flex items-center gap-3 text-xs">
                <span className="w-40 shrink-0 truncate text-ink-300">{titles[t.topicId] || t.topicId}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full rounded-full ${!t.started ? "bg-ink-700" : t.mastery >= 0.7 ? "bg-mint" : t.mastery >= 0.4 ? "bg-amber" : "bg-coral"}`} style={{ width: `${t.started ? Math.round(t.mastery * 100) : 0}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right text-ink-500">
                  {t.started ? `${Math.round(t.mastery * 100)}% · ${t.correct}/${t.attempts}` : "not started"}
                </span>
                {t.weak && <span className="rounded-full bg-coral/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-coral">weak</span>}
              </li>
            ))}
          </ul>

          {data.recommendations.next && (
            <p className="text-xs text-ink-300">Suggested next topic: <strong className="text-ink-100">{data.recommendations.next.title}</strong></p>
          )}

          {data.sessions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-300">Recent practice</p>
              <ul className="mt-1 space-y-1">
                {data.sessions.slice(0, 4).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-xs text-ink-500">
                    <span>{s.topicId ? titles[s.topicId] || s.topicId : "Mixed"} · {s.correct}/{s.answered} · {new Date(s.startedAt).toLocaleDateString()}</span>
                    <span>{s.levelPath.map((l, i) => <span key={i} className={`mr-0.5 ${LEVEL_TONE[l]}`}>{l[0].toUpperCase()}</span>)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.tutorQuestions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-300">Recent AI Tutor questions</p>
              <ul className="mt-1 space-y-1">
                {data.tutorQuestions.slice(0, 5).map((q, i) => (
                  <li key={i} className="truncate text-xs text-ink-500" title={q.question}>
                    <span className="mr-1 uppercase text-ink-700">{q.mode}</span>{q.question}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
