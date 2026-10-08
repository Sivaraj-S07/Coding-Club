import { createElement, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Wand2, Volume2, VolumeX, Target, Bot, Loader2 } from "lucide-react";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import SafeText, { CodeBlock } from "../../components/ai/SafeText";
import { SimplifiedResult } from "../../components/ai/Simplifier";
import { aiApi } from "../../lib/aiApi";
import { useAccessibility } from "../../lib/accessibility";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";
import { useCurriculum, topicText } from "../../lib/useCurriculum";
import { iconForTopic } from "../../lib/learningUi";
import { speak, stopSpeaking, speechSynthesisSupported } from "../../lib/speech";

export default function Lesson() {
  const { topicId } = useParams();
  const { token } = useStudentAccountAuth();
  const { t, lang } = useAccessibility();
  const navigate = useNavigate();
  const { topics, byId } = useCurriculum(token);
  // Results / speaking state are tagged with the lesson+language they belong
  // to, so switching either simply stops matching — no reset effect needed.
  const scope = `${topicId}:${lang}`;
  const [simplifiedState, setSimplifiedState] = useState({ scope: null, data: null });
  const [speakingScope, setSpeakingScope] = useState(null);
  const [busy, setBusy] = useState(false);
  const simplified = simplifiedState.scope === scope ? simplifiedState.data : null;
  const speaking = speakingScope === scope;

  useEffect(() => () => stopSpeaking(), [scope]);

  if (!topics) return <div className="mx-auto max-w-3xl px-5 py-10"><Skeleton className="h-64 rounded-2xl" /></div>;
  const topic = byId(topicId);
  if (!topic) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <p className="text-sm text-ink-300">{t("common.error")}</p>
        <Button className="mt-4" onClick={() => navigate("/learn")}>{t("lesson.back")}</Button>
      </div>
    );
  }

  const simple = topicText(topic, "simple", lang);
  const steps = topic.steps[lang] || topic.steps.en;
  const mistakes = topic.mistakes[lang] || topic.mistakes.en;

  const spokenText = [simple, ...steps].join(". ");
  const toggleListen = () => {
    if (speaking) {
      stopSpeaking();
      setSpeakingScope(null);
    } else if (speak(spokenText, { lang, onEnd: () => setSpeakingScope(null) })) {
      setSpeakingScope(scope);
    }
  };

  const explainSimpler = async () => {
    setBusy(true);
    try {
      const data = await aiApi(token).simplify({ text: `${simple}\n\n${steps.join("\n")}`, language: lang, level: "very_simple" });
      setSimplifiedState({ scope, data });
    } catch {
      /* keep the lesson as is */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8">
      <Link to="/learn" className="inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100"><ArrowLeft className="h-4 w-4" /> {t("lesson.back")}</Link>

      <div className="mt-5 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet/15 text-violet-soft">{createElement(iconForTopic(topic.icon), { className: "h-6 w-6" })}</div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-100">{topicText(topic, "title", lang)}</h1>
          {topic.prerequisites.length > 0 && (
            <p className="text-xs text-ink-500">{t("lesson.prereq")}: {topic.prerequisites.map((id) => topicText(byId(id), "title", lang) || id).join(", ")}</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button icon={Target} onClick={() => navigate(`/learn/practice?topic=${topic.id}`)}>{t("learn.practice")}</Button>
        <Button variant="secondary" icon={busy ? Loader2 : Wand2} onClick={explainSimpler} disabled={busy}>{t("lesson.simplifyThis")}</Button>
        <Button variant="secondary" icon={Bot} onClick={() => navigate(`/tutor?topic=${topic.id}`)}>{t("learn.askTutor")}</Button>
        {speechSynthesisSupported() && <Button variant="ghost" icon={speaking ? VolumeX : Volume2} onClick={toggleListen}>{speaking ? t("tutor.stopSpeaking") : t("tutor.listen")}</Button>}
      </div>

      <section className="glass-card mt-6 p-5" aria-labelledby="l-simple">
        <h2 id="l-simple" className="font-display text-base font-semibold text-ink-100">{t("lesson.simple")}</h2>
        <SafeText text={simple} className="mt-2 !text-base" />
      </section>

      {simplified && <div className="mt-4"><SimplifiedResult data={simplified} /></div>}

      <section className="glass-card mt-4 p-5" aria-labelledby="l-steps">
        <h2 id="l-steps" className="font-display text-base font-semibold text-ink-100">{t("lesson.steps")}</h2>
        <ol className="mt-3 space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-ink-300">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-electric/15 text-xs font-semibold text-electric-light">{i + 1}</span>
              <SafeText text={s} className="pt-0.5" />
            </li>
          ))}
        </ol>
      </section>

      <section className="glass-card mt-4 p-5" aria-labelledby="l-example">
        <h2 id="l-example" className="font-display text-base font-semibold text-ink-100">{t("lesson.example")}</h2>
        <div className="mt-3"><CodeBlock code={topic.example.code} language="python" /></div>
        <p className="mt-3 text-sm text-ink-300">{topicText(topic.example, "explain", lang)}</p>
        <Button className="mt-3" variant="secondary" size="sm" onClick={() => navigate("/programming")}>{t("learn.playground")}</Button>
      </section>

      <section className="glass-card mt-4 p-5" aria-labelledby="l-mistakes">
        <h2 id="l-mistakes" className="font-display text-base font-semibold text-ink-100">{t("lesson.mistakes")}</h2>
        <ul className="mt-3 space-y-2">
          {mistakes.map((m, i) => <li key={i}><SafeText text={m} /></li>)}
        </ul>
      </section>
    </div>
  );
}
