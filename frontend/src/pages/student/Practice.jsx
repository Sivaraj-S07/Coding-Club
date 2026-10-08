import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, TrendingUp, TrendingDown, Minus, Wand2, Volume2, Trophy, Loader2, AlertTriangle, RotateCcw, ArrowRight } from "lucide-react";
import Button from "../../components/ui/Button";
import SafeText from "../../components/ai/SafeText";
import { SimplifiedResult } from "../../components/ai/Simplifier";
import { aiApi } from "../../lib/aiApi";
import { ApiError } from "../../lib/api";
import { useAccessibility } from "../../lib/accessibility";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";
import { useCurriculum, topicText } from "../../lib/useCurriculum";
import { LEVEL_TEXT, LEVEL_BG } from "../../lib/learningUi";
import { speak, speechSynthesisSupported, stopSpeaking } from "../../lib/speech";

const LEVEL_ORDER = ["easy", "medium", "hard"];

function LevelPill({ level, t }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold ${LEVEL_TEXT[level]}`}>
      <span className={`h-2 w-2 rounded-full ${LEVEL_BG[level]}`} /> {t(`level.${level}`)}
    </span>
  );
}

function PathDots({ history, t }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label={t("practice.pathTitle")}>
      {history.map((h, i) => (
        <li key={i} className="flex flex-col items-center gap-1">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold text-void ${LEVEL_BG[h.level]} ${h.correct ? "border-white" : "border-transparent opacity-60"}`}
            title={`${t(`level.${h.level}`)} — ${h.correct ? "✓" : "✗"}`}
          >
            {h.correct ? "✓" : "✗"}
          </span>
          <span className="text-[10px] uppercase text-ink-500">{t(`level.${h.level}`).slice(0, 3)}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Practice() {
  const { token } = useStudentAccountAuth();
  const { t, lang, settings } = useAccessibility();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const topicParam = params.get("topic");
  const resumeParam = params.get("resume");
  const { byId } = useCurriculum(token);

  const [phase, setPhase] = useState("loading"); // loading | answering | feedback | done | error
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null); // answer response
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [simplified, setSimplified] = useState(null);
  const [simplifying, setSimplifying] = useState(false);

  const mounted = useRef(true);
  const started = useRef(false);
  const shownAt = useRef(0); // set whenever a question is shown
  const headingRef = useRef(null);
  const feedbackRef = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopSpeaking();
    };
  }, []);

  // Starts a fresh session, or resumes one when `resumeId` is given.
  const begin = useCallback(
    (resumeId, topicId) => {
      setPhase("loading");
      setHistory([]);
      setSummary(null);
      setResult(null);
      setSelected(null);
      setSimplified(null);
      setError(null);
      const api = aiApi(token);
      const request = resumeId ? api.getSession(resumeId) : api.startPractice({ topicId: topicId ?? null, language: lang });
      request
        .then((data) => {
          if (!mounted.current) return;
          setSession(data.session);
          if (data.session.status === "completed") {
            setSummary(data.summary);
            setPhase("done");
          } else if (data.question) {
            setQuestion(data.question);
            shownAt.current = Date.now();
            setPhase("answering");
          } else {
            setError(new ApiError("This practice session can't be resumed.", 409));
            setPhase("error");
          }
        })
        .catch((err) => {
          if (!mounted.current) return;
          setError(err);
          setPhase("error");
        });
    },
    [token, lang]
  );

  // Start (or resume) exactly once, even under React StrictMode's double effect.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    begin(resumeParam, topicParam);
  }, [begin, resumeParam, topicParam]);

  useEffect(() => {
    if (phase === "feedback") feedbackRef.current?.focus();
    if (phase === "answering") headingRef.current?.focus();
  }, [phase, question?.id]);

  const submit = useCallback(
    async (e) => {
      e?.preventDefault();
      if (selected === null || busy || !session || !question) return;
      setBusy(true);
      try {
        const data = await aiApi(token).answer(session.id, {
          questionId: question.id,
          selectedIndex: selected,
          timeMs: Date.now() - shownAt.current,
        });
        if (!mounted.current) return;
        setResult(data);
        setSession(data.session);
        setHistory((h) => [...h, { level: question.level, correct: data.result.correct }]);
        setSimplified(null);
        setPhase("feedback");
      } catch (err) {
        if (!mounted.current) return;
        setError(err);
        setPhase("error");
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [selected, busy, session, question, token]
  );

  const next = () => {
    stopSpeaking();
    if (result.nextQuestion) {
      setQuestion(result.nextQuestion);
      setSelected(null);
      setResult(null);
      setSimplified(null);
      shownAt.current = Date.now();
      setPhase("answering");
    } else {
      setSummary(result.summary);
      setPhase("done");
    }
  };

  const explainSimpler = async () => {
    setSimplifying(true);
    try {
      const text = `${question.text}\n\n${t("practice.correctAnswerWas")}: ${result.result.correctText}\n\n${result.result.explanation}`;
      const data = await aiApi(token).simplify({ text, language: lang, level: settings.simplifiedText ? "very_simple" : "simple" });
      if (mounted.current) setSimplified(data);
    } catch {
      /* the original explanation stays on screen */
    } finally {
      if (mounted.current) setSimplifying(false);
    }
  };

  // ---------------------------------------------------------------- render
  if (phase === "loading") {
    return <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-ink-300"><Loader2 className="h-4 w-4 animate-spin" /> {t("practice.starting")}</div>;
  }

  if (phase === "error") {
    const gone = error instanceof ApiError && (error.status === 404 || error.status === 409);
    return (
      <div className="mx-auto max-w-xl px-5 py-16">
        <div role="alert" className="glass-card flex items-start gap-3 p-6">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
          <div>
            <p className="text-sm text-ink-100">{error?.message || t("common.error")}</p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={() => navigate("/learn")}>{t("practice.back")}</Button>
              {gone && <Button size="sm" variant="secondary" onClick={() => begin(null, session?.topicId || topicParam)}>{t("practice.again")}</Button>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const s = summary || { total: session?.answered || 0, correct: session?.correct || 0, accuracy: 0, xpEarned: session?.xpEarned || 0, focusTopics: [], peakLevel: session?.level };
    const pct = Math.round((s.accuracy || 0) * 100);
    return (
      <div className="mx-auto max-w-2xl px-5 py-10">
        <div className="glass-card p-6 text-center">
          <Trophy className="mx-auto h-10 w-10 text-amber" />
          <h1 className="mt-3 font-display text-2xl font-semibold text-ink-100">{t("practice.done")}</h1>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/[0.04] p-3"><p className="text-xs text-ink-500">{t("practice.accuracy")}</p><p className="font-display text-2xl text-ink-100">{pct}%</p><p className="text-xs text-ink-500">{s.correct}/{s.total}</p></div>
            <div className="rounded-xl bg-white/[0.04] p-3"><p className="text-xs text-ink-500">{t("practice.xpEarned")}</p><p className="font-display text-2xl text-amber">+{s.xpEarned}</p></div>
            <div className="rounded-xl bg-white/[0.04] p-3"><p className="text-xs text-ink-500">{t("practice.peak")}</p><p className={`font-display text-2xl ${LEVEL_TEXT[s.peakLevel] || "text-ink-100"}`}>{s.peakLevel ? t(`level.${s.peakLevel}`) : "—"}</p></div>
          </div>
          {history.length > 0 && (
            <div className="mt-6 flex flex-col items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("practice.pathTitle")}</p>
              <PathDots history={history} t={t} />
            </div>
          )}
          {s.endedEarly && <p role="note" className="mt-6 rounded-xl border border-amber/30 bg-amber/10 p-3 text-left text-sm text-amber">{t("practice.endedEarly")}</p>}
          {s.focusTopics?.length > 0 && (
            <div className="mt-6 text-left">
              <p className="text-sm font-semibold text-ink-100">{t("practice.focus")}</p>
              <ul className="mt-2 space-y-2">
                {s.focusTopics.map((id) => (
                  <li key={id} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] p-2.5 text-sm text-ink-300">
                    <span>{topicText(byId(id), "title", lang) || id}</span>
                    <Link to={`/learn/lessons/${id}`} className="inline-flex items-center gap-1 text-xs text-electric-light hover:underline">{t("learn.lesson")} <ArrowRight className="h-3 w-3" /></Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <Button icon={RotateCcw} onClick={() => begin(null, session?.topicId)}>{t("practice.again")}</Button>
            <Button variant="secondary" onClick={() => navigate("/learn")}>{t("practice.back")}</Button>
          </div>
        </div>
      </div>
    );
  }

  const answered = phase === "feedback";
  const isLast = answered && !result.nextQuestion;
  // Describe what actually happens next: compare the level of the question
  // just answered with the level of the one being served.
  const nextLevel = result?.nextQuestion?.level || null;
  const direction = nextLevel ? Math.sign(LEVEL_ORDER.indexOf(nextLevel) - LEVEL_ORDER.indexOf(question.level)) : 0;
  const topicName = topicText(byId(question.topicId), "title", lang);

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("practice.title")}{topicName ? ` · ${topicName}` : ""}</p>
          <p className="mt-1 text-sm text-ink-300">{t("practice.questionOf", { n: Math.min(session.answered + (answered ? 0 : 1), session.total), total: session.total })}</p>
        </div>
        <LevelPill level={question.level} t={t} />
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={session.total} aria-valuenow={session.answered} aria-label={t("practice.title")}>
        <div className="h-full rounded-full bg-electric transition-all" style={{ width: `${(session.answered / session.total) * 100}%` }} />
      </div>

      <form onSubmit={submit} className="glass-card mt-6 p-5">
        <h1 ref={headingRef} tabIndex={-1} className="sr-only">{t("practice.questionOf", { n: session.answered + (answered ? 0 : 1), total: session.total })}</h1>
        <SafeText text={question.text} className="!text-base !text-ink-100" />

        <fieldset className="mt-5" disabled={answered}>
          <legend className="sr-only">{t("practice.chooseAnswer")}</legend>
          <div className="space-y-2">
            {question.options.map((opt, i) => {
              const isCorrect = answered && i === result.result.correctIndex;
              const isWrongPick = answered && selected === i && !result.result.correct;
              return (
                <label
                  key={i}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors ${
                    isCorrect ? "border-mint bg-mint/10 text-ink-100" : isWrongPick ? "border-coral bg-coral/10 text-ink-100" : selected === i ? "border-electric bg-electric/10 text-ink-100" : "border-white/10 text-ink-300 hover:bg-white/5"
                  } ${answered ? "cursor-default" : ""}`}
                >
                  <input type="radio" name="answer" value={i} checked={selected === i} onChange={() => setSelected(i)} className="h-4 w-4 shrink-0 appearance-none rounded-full border-2 border-ink-500 checked:border-electric checked:bg-electric checked:shadow-[inset_0_0_0_3px_#0B1220]" />
                  <span className="flex-1 font-mono text-[13px]">{opt}</span>
                  {isCorrect && <span className="inline-flex items-center gap-1 text-xs font-semibold text-mint"><CheckCircle2 className="h-4 w-4" /> {t("practice.correct")}</span>}
                  {isWrongPick && <span className="inline-flex items-center gap-1 text-xs font-semibold text-coral"><XCircle className="h-4 w-4" /> {t("practice.notQuite")}</span>}
                </label>
              );
            })}
          </div>
        </fieldset>

        {!answered && (
          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={selected === null || busy} icon={busy ? Loader2 : undefined}>{t("practice.check")}</Button>
          </div>
        )}
      </form>

      {answered && (
        <div ref={feedbackRef} tabIndex={-1} role="status" aria-live="polite" className="mt-5 space-y-4 outline-none">
          <div className={`rounded-2xl border p-4 ${result.result.correct ? "border-mint/40 bg-mint/10" : "border-coral/40 bg-coral/10"}`}>
            <p className={`flex items-center gap-2 text-sm font-semibold ${result.result.correct ? "text-mint" : "text-coral"}`}>
              {result.result.correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {result.result.correct ? t("practice.correct") : t("practice.notQuite")} <span className="ml-auto text-xs text-amber">+{result.result.xpGained} XP</span>
            </p>
            {!result.result.correct && <p className="mt-1 text-sm text-ink-300">{t("practice.correctAnswerWas")}: <span className="font-mono text-ink-100">{result.result.correctText}</span></p>}
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("practice.explanation")}</p>
              <SafeText text={result.result.explanation} className="mt-1 !text-ink-100" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" icon={simplifying ? Loader2 : Wand2} onClick={explainSimpler} disabled={simplifying}>{t("practice.explainSimpler")}</Button>
              {speechSynthesisSupported() && <Button type="button" variant="ghost" size="sm" icon={Volume2} onClick={() => speak(result.result.explanation, { lang })}>{t("tutor.listen")}</Button>}
            </div>
          </div>

          {simplified && <SimplifiedResult data={simplified} />}

          {nextLevel && !isLast && (
            <p className={`flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm ${direction > 0 ? "text-mint" : direction < 0 ? "text-amber" : "text-ink-300"}`}>
              {direction > 0 ? <TrendingUp className="h-4 w-4" /> : direction < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              {direction > 0 ? t("practice.levelUp") : direction < 0 ? t("practice.levelDown") : t("practice.levelSame")}
              <LevelPill level={nextLevel} t={t} />
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={next} icon={ArrowRight}>{isLast ? t("practice.finish") : t("practice.next")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
