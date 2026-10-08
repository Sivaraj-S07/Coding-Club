import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Brain, Flame, Trophy, Target, ArrowRight, Sparkles, BookOpen, Bot, Play, AlertTriangle, Calendar } from "lucide-react";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import { aiApi } from "../../lib/aiApi";
import { ApiError } from "../../lib/api";
import { useAccessibility } from "../../lib/accessibility";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";
import { useCurriculum, topicText } from "../../lib/useCurriculum";
import { iconForTopic, masteryBar, masteryLabelKey, actionTarget, REASON_KEY } from "../../lib/learningUi";

const ACTION_ICON = { lesson: BookOpen, practice: Target, tutor: Bot, playground: Play };

export function StatTile({ icon: Icon, label, value, sub, tone = "text-electric-light" }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
        <Icon className={`h-4 w-4 ${tone}`} /> {label}
      </div>
      <p className="mt-2 font-display text-2xl font-semibold text-ink-100">{value}</p>
      {sub}
    </div>
  );
}

export default function Learn() {
  const { token } = useStudentAccountAuth();
  const { t, lang } = useAccessibility();
  const navigate = useNavigate();
  const { topics, byId } = useCurriculum(token);
  const [data, setData] = useState(null);
  const [resume, setResume] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const api = aiApi(token);
    Promise.all([api.recommendations(), api.sessions().catch(() => ({ sessions: [] }))])
      .then(([rec, sessions]) => {
        if (!alive) return;
        setData(rec);
        setResume((sessions.sessions || []).find((s) => s.status === "in_progress") || null);
      })
      .catch((err) => alive && setError(err));
    return () => {
      alive = false;
    };
  }, [token]);

  if (error) {
    const setup = error instanceof ApiError && error.status === 503;
    return (
      <div className="mx-auto max-w-2xl px-5 py-16">
        <div role="alert" className="glass-card flex items-start gap-3 p-6">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
          <div>
            <h1 className="font-display text-lg font-semibold text-ink-100">{setup ? t("learn.setup") : t("common.error")}</h1>
            <p className="mt-2 text-sm text-ink-300">{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  const rec = data?.recommendations;
  const profile = data?.profile;
  const title = (id) => topicText(byId(id), "title", lang) || id;
  const statsByTopic = Object.fromEntries((rec?.topics || []).map((s) => [s.topicId, s]));

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet to-electric shadow-glow">
            <Brain className="h-5 w-5 text-void" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink-100">{t("learn.title")}</h1>
            <p className="mt-1 text-sm text-ink-500">{t("learn.subtitle")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {resume && (
            <Button variant="secondary" icon={Play} onClick={() => navigate(`/learn/practice?resume=${resume.id}`)}>{t("practice.resume")}</Button>
          )}
          <Button icon={Sparkles} onClick={() => navigate("/learn/practice")}>{t("learn.startPractice")}</Button>
        </div>
      </div>

      {!data ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatTile
              icon={Trophy}
              label={t("learn.level")}
              value={profile.level}
              tone="text-amber"
              sub={
                <div className="mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={profile.xpForNext} aria-valuenow={profile.xpIntoLevel} aria-label={t("learn.xp")}>
                    <div className="h-full rounded-full bg-amber" style={{ width: `${Math.min(100, (profile.xpIntoLevel / profile.xpForNext) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-ink-500">{profile.xp} {t("learn.xp")}</p>
                </div>
              }
            />
            <StatTile icon={Flame} label={t("learn.streak")} value={profile.streakDays} tone="text-coral" />
            <StatTile
              icon={Brain}
              label={t("learn.mastery")}
              value={rec.overall.key === "not-started" ? "—" : `${Math.round(rec.overall.mastery * 100)}%`}
              sub={<p className="mt-1 text-xs capitalize text-ink-500">{rec.overall.key === "not-started" ? t("learn.notStarted") : rec.overall.key}</p>}
            />
          </div>

          {rec.actions.length > 0 && (
            <section className="mt-8" aria-labelledby="rec-title">
              <h2 id="rec-title" className="font-display text-lg font-semibold text-ink-100">{t("learn.recommended")}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {rec.actions.map((a, i) => {
                  const Icon = ACTION_ICON[a.type] || Target;
                  const label = a.topicId ? title(a.topicId) : t("learn.mixed");
                  return (
                    <Link key={`${a.type}-${a.topicId}-${i}`} to={actionTarget(a)} className="glass-card group flex items-center gap-3 p-4 transition-colors hover:border-electric/40">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-electric/15 text-electric-light"><Icon className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-100">
                          {a.type === "lesson" ? t("learn.lesson") : t("learn.practice")}: {label}
                        </p>
                        <p className="text-xs text-ink-500">{t(REASON_KEY[a.reason] || "learn.reason.next")}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-ink-500 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          <section className="mt-8" aria-labelledby="weak-title">
            <h2 id="weak-title" className="font-display text-lg font-semibold text-ink-100">{t("learn.weak")}</h2>
            {rec.weakTopics.length === 0 ? (
              <p className="glass-card mt-3 p-4 text-sm text-ink-500">{t("learn.noWeak")}</p>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {rec.weakTopics.map((w) => (
                  <li key={w.topicId} className="glass-card flex items-center justify-between gap-3 border-coral/30 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-100">{title(w.topicId)}</p>
                      <p className="text-xs text-ink-500">
                        {w.accuracy !== null && `${Math.round(w.accuracy * 100)}% ${t("learn.accuracy")}`}
                        {w.quizAttempts > 0 && ` · ${w.quizAttempts} ${t("learn.fromQuizzes")}`}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => navigate(`/learn/practice?topic=${w.topicId}`)}>{t("learn.practice")}</Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8" aria-labelledby="topics-title">
            <h2 id="topics-title" className="font-display text-lg font-semibold text-ink-100">{t("learn.lessons")}</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(topics || []).map((topic) => {
                const s = statsByTopic[topic.id];
                const Icon = iconForTopic(topic.icon);
                return (
                  <article key={topic.id} className="glass-card flex flex-col p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet/15 text-violet-soft"><Icon className="h-5 w-5" /></div>
                      <h3 className="font-display text-sm font-semibold text-ink-100">{topicText(topic, "title", lang)}</h3>
                    </div>
                    <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-500">{topicText(topic, "summary", lang)}</p>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-ink-300">
                        <span>{t(masteryLabelKey(s))}</span>
                        <span>{s?.started ? `${Math.round(s.mastery * 100)}%` : ""}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((s?.mastery || 0) * 100)} aria-label={`${topicText(topic, "title", lang)} ${t("learn.mastery")}`}>
                        <div className={`h-full rounded-full ${masteryBar(s)}`} style={{ width: `${s?.started ? Math.round(s.mastery * 100) : 0}%` }} />
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button variant="secondary" size="sm" className="flex-1" onClick={() => navigate(`/learn/lessons/${topic.id}`)}>{t("learn.lesson")}</Button>
                      <Button size="sm" className="flex-1" onClick={() => navigate(`/learn/practice?topic=${topic.id}`)}>{t("learn.practice")}</Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {rec.plan.length > 0 && (
            <section className="mt-8" aria-labelledby="plan-title">
              <h2 id="plan-title" className="flex items-center gap-2 font-display text-lg font-semibold text-ink-100"><Calendar className="h-5 w-5 text-electric-light" /> {t("learn.plan")}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-5">
                {[1, 2, 3, 4, 5].map((day) => (
                  <div key={day} className="glass-card p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("learn.day")} {day}</p>
                    <ul className="mt-2 space-y-2">
                      {rec.plan.filter((p) => p.day === day).map((p, i) => {
                        const Icon = ACTION_ICON[p.type] || Target;
                        return (
                          <li key={i}>
                            <Link to={actionTarget(p)} className="flex items-start gap-1.5 rounded-lg p-1 text-xs text-ink-300 hover:bg-white/5 hover:text-ink-100">
                              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-electric-light" />
                              <span>{p.topicId ? title(p.topicId) : t("learn.mixed")} <span className="text-ink-500">· {p.minutes} {t("learn.min")}</span></span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
