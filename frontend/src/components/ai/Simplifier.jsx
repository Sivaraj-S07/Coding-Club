import { useEffect, useRef, useState } from "react";
import { Wand2, Volume2, VolumeX, Loader2, Info } from "lucide-react";
import Button from "../ui/Button";
import SafeText, { CodeBlock } from "./SafeText";
import { aiApi } from "../../lib/aiApi";
import { ApiError } from "../../lib/api";
import { speak, stopSpeaking, speechSynthesisSupported } from "../../lib/speech";
import { useAccessibility } from "../../lib/accessibility";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";

/** Renders one simplification result: simple words, steps, example, key terms. */
export function SimplifiedResult({ data }) {
  const { t, lang } = useAccessibility();
  const [speaking, setSpeaking] = useState(false);
  const result = data?.result;

  useEffect(() => () => stopSpeaking(), []);
  if (!result) return null;

  const spoken = [result.simple, ...(result.steps || [])].join(". ");
  const toggleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else {
      setSpeaking(speak(spoken, { lang, onEnd: () => setSpeaking(false) }));
    }
  };

  return (
    <div className="space-y-4" aria-live="polite">
      {result.note === "ta-needs-ai" && (
        <p className="flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/10 p-3 text-xs text-amber">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t("tutor.taNeedsAi")}
        </p>
      )}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold text-ink-100">{t("tutor.simple")}</h3>
          {speechSynthesisSupported() && (
            <button type="button" onClick={toggleSpeak} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-ink-300 hover:bg-white/10 hover:text-ink-100">
              {speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              {speaking ? t("tutor.stopSpeaking") : t("tutor.listen")}
            </button>
          )}
        </div>
        <SafeText text={result.simple} className="mt-2 !text-ink-100" />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="font-display text-sm font-semibold text-ink-100">{t("tutor.steps")}</h3>
        <ol className="mt-2 space-y-2">
          {result.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-ink-300">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-electric/15 text-xs font-semibold text-electric-light">{i + 1}</span>
              <SafeText text={step} className="pt-0.5" />
            </li>
          ))}
        </ol>
      </section>

      {result.example && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="font-display text-sm font-semibold text-ink-100">{t("tutor.example")}</h3>
          <div className="mt-2"><CodeBlock code={result.example.code} language={result.example.language} /></div>
          {result.example.explanation && <p className="mt-2 text-sm text-ink-300">{result.example.explanation}</p>}
        </section>
      )}

      {result.keyTerms?.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="font-display text-sm font-semibold text-ink-100">{t("tutor.keyTerms")}</h3>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {result.keyTerms.map((k) => (
              <div key={k.term} className="rounded-xl bg-white/[0.04] p-2.5">
                <dt className="text-sm font-semibold text-electric-light">{k.term}</dt>
                <dd className="text-xs text-ink-300">{k.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

/** Paste-your-own-text simplifier (also used with `initialText` from lessons). */
export default function Simplifier({ initialText = "" }) {
  const { t, lang, settings } = useAccessibility();
  const { token } = useStudentAccountAuth();
  const [text, setText] = useState(initialText);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const area = useRef(null);

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const out = await aiApi(token).simplify({ text, language: lang, level: settings.simplifiedText ? "very_simple" : "simple" });
      setData(out);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="simplify-input" className="field-label">{t("tutor.pasteLabel")}</label>
        <textarea
          id="simplify-input"
          ref={area}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={6000}
          rows={6}
          className="field-input resize-y"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-ink-500">{text.length}/6000</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setText(""); setData(null); setError(""); area.current?.focus(); }} disabled={!text && !data}>
              {t("tutor.clear")}
            </Button>
            <Button onClick={run} disabled={busy || text.trim().length < 5} icon={busy ? Loader2 : Wand2}>
              {busy ? t("tutor.thinking") : t("tutor.simplifyBtn")}
            </Button>
          </div>
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{error}</p>}
      {data && (
        <>
          {data.fallback && <p className="text-xs text-ink-500">{t("tutor.aiFallback")}</p>}
          <SimplifiedResult data={data} />
        </>
      )}
    </div>
  );
}
