import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Brain, Flame, Trophy, ArrowRight, Target, BookOpen, Bot } from "lucide-react";
import { aiApi } from "../../lib/aiApi";
import { useAccessibility } from "../../lib/accessibility";
import { useCurriculum, topicText } from "../../lib/useCurriculum";
import { actionTarget, REASON_KEY } from "../../lib/learningUi";

const ICON = { lesson: BookOpen, practice: Target, tutor: Bot };

/**
 * Compact "AI learning" card for the existing student Dashboard. It fails
 * silently-but-gracefully: if the AI tables haven't been migrated yet it simply
 * shows an invitation to open the Learn space instead of breaking the page.
 */
export default function LearningSnapshot({ token }) {
  const { t, lang } = useAccessibility();
  const { byId } = useCurriculum(token);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    aiApi(token).recommendations().then((d) => alive && setData(d)).catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [token]);

  const rec = data?.recommendations;
  const profile = data?.profile;
  const top = rec?.actions?.slice(0, 2) || [];

  return (
    <section className="glass-card mt-8 p-5" aria-labelledby="snapshot-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="snapshot-title" className="flex items-center gap-2 font-display text-lg font-semibold text-ink-100">
          <Brain className="h-5 w-5 text-violet-soft" /> {t("learn.title")}
        </h2>
        <Link to="/learn" className="inline-flex items-center gap-1 text-sm font-medium text-electric-light hover:underline">
          {t("nav.learn")} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {profile && (
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-1.5 text-ink-100"><Trophy className="h-4 w-4 text-amber" /> {t("learn.level")} {profile.level} · {profile.xp} {t("learn.xp")}</span>
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-1.5 text-ink-100"><Flame className="h-4 w-4 text-coral" /> {profile.streakDays} {t("learn.streak")}</span>
          {rec.weakTopics.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-coral/30 bg-coral/10 px-3 py-1.5 text-coral">
              {t("learn.weak")}: {rec.weakTopics.map((w) => topicText(byId(w.topicId), "title", lang) || w.topicId).join(", ")}
            </span>
          )}
        </div>
      )}

      {top.length > 0 ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {top.map((a, i) => {
            const Icon = ICON[a.type] || Target;
            return (
              <li key={i}>
                <Link to={actionTarget(a)} className="flex items-center gap-3 rounded-xl border border-white/10 p-3 text-sm text-ink-100 transition-colors hover:border-electric/40">
                  <Icon className="h-4 w-4 shrink-0 text-electric-light" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.topicId ? topicText(byId(a.topicId), "title", lang) : t("learn.mixed")}</span>
                    <span className="block text-xs text-ink-500">{t(REASON_KEY[a.reason] || "learn.reason.next")}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-500">{failed ? t("learn.subtitle") : t("common.loading")}</p>
      )}
    </section>
  );
}
