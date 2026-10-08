import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bot, Send, Square, Mic, MicOff, Volume2, VolumeX, ShieldCheck, Loader2, Target, BookOpen, AlertTriangle, Languages } from "lucide-react";
import Button from "../../components/ui/Button";
import SafeText from "../../components/ai/SafeText";
import Simplifier from "../../components/ai/Simplifier";
import { aiApi } from "../../lib/aiApi";
import { ApiError } from "../../lib/api";
import { useAccessibility } from "../../lib/accessibility";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";
import { useCurriculum, topicText } from "../../lib/useCurriculum";
import { useVoiceInput } from "../../lib/useVoiceInput";
import { speak, stopSpeaking, hasVoiceFor, speechSynthesisSupported } from "../../lib/speech";

const VOICE_ERRORS = { "not-allowed": "tutor.micDenied", "service-not-allowed": "tutor.micDenied", "no-speech": "tutor.noSpeech", unsupported: "tutor.voiceUnsupported" };

export default function Tutor() {
  const { token } = useStudentAccountAuth();
  const { t, lang, update } = useAccessibility();
  const [params] = useSearchParams();
  const topicParam = params.get("topic");
  const { byId } = useCurriculum(token);

  const [tab, setTab] = useState("chat");
  const [messages, setMessages] = useState([]); // {role, content, topicId?, followUps?, fallback?}
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // {tone, text}
  const [status, setStatus] = useState(null);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const messagesRef = useRef(messages);
  const abortRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let alive = true;
    aiApi(token).status().then((s) => alive && setStatus(s)).catch(() => {});
    return () => {
      alive = false;
      abortRef.current?.abort();
      abortRef.current = null;
      stopSpeaking();
    };
  }, [token]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy]);

  const ask = useCallback(
    async (text, mode = "chat") => {
      const message = text.trim();
      if (!message || abortRef.current) return;
      const controller = new AbortController();
      abortRef.current = controller;
      stopSpeaking();
      setSpeakingIndex(null);
      setNotice(null);
      const previousMessages = messagesRef.current;
      const history = previousMessages.map((m) => ({ role: m.role, content: m.content }));
      const pending = [...messagesRef.current, { role: "user", content: message }];
      messagesRef.current = pending;
      setMessages(pending);
      setInput("");
      setBusy(true);
      try {
        const data = await aiApi(token).tutor({ message, history, language: lang, mode, topicId: topicParam || undefined }, controller.signal);
        if (abortRef.current !== controller || controller.signal.aborted) return;
        const index = messagesRef.current.length; // index the reply will have
        setMessages((m) => [...m, { role: "assistant", content: data.reply, topicId: data.topicId, followUps: data.followUps, fallback: data.fallback && status?.aiEnabled }]);
        if (mode === "voice" || autoSpeak) {
          setSpeakingIndex(index);
          const ok = speak(data.reply, { lang, onEnd: () => setSpeakingIndex(null) });
          if (!ok) setSpeakingIndex(null);
        }
      } catch (err) {
        if (abortRef.current !== controller) return;
        if (err.name === "AbortError") {
          messagesRef.current = previousMessages;
          setMessages(previousMessages);
          setInput(message);
          return;
        }
        const paused = err instanceof ApiError && err.status === 423;
        setNotice({ tone: paused ? "amber" : "coral", text: paused ? t("tutor.paused") : err instanceof ApiError ? err.message : t("common.error") });
        messagesRef.current = previousMessages;
        setMessages(previousMessages);
        setInput(message);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setBusy(false);
          inputRef.current?.focus();
        }
      }
    },
    [token, lang, topicParam, autoSpeak, status, t]
  );

  const voice = useVoiceInput({ lang, onResult: (text) => ask(text, "voice") });
  const voiceError = voice.error ? t(VOICE_ERRORS[voice.error] || "common.error") : null;
  const noTamilVoice = lang === "ta" && speechSynthesisSupported() && !hasVoiceFor("ta");

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(input);
    }
  };

  const toggleSpeakMessage = (index, content) => {
    if (speakingIndex === index) {
      stopSpeaking();
      setSpeakingIndex(null);
    } else {
      setSpeakingIndex(index);
      if (!speak(content, { lang, onEnd: () => setSpeakingIndex(null) })) setSpeakingIndex(null);
    }
  };

  const suggestions = ["tutor.suggest1", "tutor.suggest2", "tutor.suggest3"];
  const tabBtn = (id, label) => (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={tab === id}
      aria-controls={`panel-${id}`}
      onClick={() => setTab(id)}
      className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${tab === id ? "bg-electric/15 text-electric-light" : "text-ink-300 hover:bg-white/5"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet to-electric shadow-glow"><Bot className="h-5 w-5 text-void" strokeWidth={2.25} /></div>
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink-100">{t("tutor.title")}</h1>
            <p className="mt-1 text-sm text-ink-500">{t("tutor.subtitle")}</p>
          </div>
        </div>
        <button type="button" onClick={() => update({ language: lang === "en" ? "ta" : "en" })} className="inline-flex items-center gap-1.5 rounded-xl glass px-3 py-2 text-xs font-medium text-ink-300 hover:text-ink-100" aria-label={`${t("a11y.language")}: ${lang === "en" ? "தமிழ்" : "English"}`}>
          <Languages className="h-4 w-4" /> {lang === "en" ? "தமிழ்" : "English"}
        </button>
      </div>

      {status && (
        <p className={`mt-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${status.aiEnabled ? "border-mint/30 bg-mint/10 text-mint" : "border-white/15 bg-white/5 text-ink-300"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status.aiEnabled ? "bg-mint" : "bg-ink-500"}`} /> {status.aiEnabled ? t("tutor.aiOn") : t("tutor.aiOffline")}
        </p>
      )}

      <div role="tablist" aria-label={t("tutor.title")} className="mt-5 flex gap-2">
        {tabBtn("chat", t("tutor.chat"))}
        {tabBtn("simplify", t("tutor.simplify"))}
      </div>

      {tab === "chat" ? (
        <section id="panel-chat" role="tabpanel" aria-labelledby="tab-chat" className="glass-card mt-4 flex flex-col">
          <div ref={logRef} role="log" aria-live="polite" aria-label={t("tutor.title")} className="max-h-[55vh] min-h-[16rem] space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="space-y-4 py-6 text-center">
                <p className="text-sm text-ink-300">{topicParam && byId(topicParam) ? `${topicText(byId(topicParam), "title", lang)} — ` : ""}{t("tutor.empty")}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestions.map((k) => (
                    <button key={k} type="button" onClick={() => ask(t(k))} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-ink-300 hover:border-electric/50 hover:text-ink-100">{t(k)}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[92%] rounded-2xl px-4 py-3 ${m.role === "user" ? "bg-electric/20 text-ink-100" : "border border-white/10 bg-white/[0.04]"}`}>
                  <span className="sr-only">{m.role === "user" ? "You" : t("tutor.title")}:</span>
                  {m.role === "user" ? <p className="whitespace-pre-wrap text-sm text-ink-100">{m.content}</p> : <SafeText text={m.content} />}
                  {m.role === "assistant" && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {speechSynthesisSupported() && (
                        <button type="button" onClick={() => toggleSpeakMessage(i, m.content)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-300 hover:bg-white/10 hover:text-ink-100">
                          {speakingIndex === i ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />} {speakingIndex === i ? t("tutor.stopSpeaking") : t("tutor.listen")}
                        </button>
                      )}
                      {m.followUps?.map((f) => (
                        <Link key={f.type} to={f.type === "practice" ? `/learn/practice?topic=${f.topicId}` : `/learn/lessons/${f.topicId}`} className="inline-flex items-center gap-1 rounded-lg bg-electric/10 px-2 py-1 text-xs text-electric-light hover:bg-electric/20">
                          {f.type === "practice" ? <Target className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
                          {f.type === "practice" ? t("tutor.practiceThis") : t("tutor.openLesson")}
                        </Link>
                      ))}
                      {m.fallback && <span className="text-[11px] text-ink-500">{t("tutor.aiFallback")}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin" /> {t("tutor.thinking")}</p>}
          </div>

          <div className="border-t hairline p-3">
            {(notice || voiceError || noTamilVoice || (!voice.supported)) && (
              <div className="mb-2 space-y-1.5">
                {notice && <p role="alert" className={`flex items-start gap-2 rounded-xl border p-2.5 text-xs ${notice.tone === "amber" ? "border-amber/30 bg-amber/10 text-amber" : "border-coral/30 bg-coral/10 text-coral"}`}><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {notice.text}</p>}
                {voiceError && <p role="alert" className="rounded-xl border border-amber/30 bg-amber/10 p-2.5 text-xs text-amber">{voiceError}</p>}
                {noTamilVoice && <p className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-xs text-ink-300">{t("tutor.noTamilVoice")}</p>}
                {!voice.supported && <p className="text-xs text-ink-500">{t("tutor.voiceUnsupported")}</p>}
              </div>
            )}
            {voice.listening && (
              <p role="status" className="mb-2 flex items-center gap-2 text-sm text-mint"><span className="h-2 w-2 animate-pulseGlow rounded-full bg-mint" /> {voice.interim || t("tutor.listening")}</p>
            )}
            <div className="flex items-end gap-2">
              <label htmlFor="tutor-input" className="sr-only">{t("tutor.placeholder")}</label>
              <textarea
                id="tutor-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                maxLength={1500}
                placeholder={t("tutor.placeholder")}
                className="field-input flex-1 resize-none"
              />
              {voice.supported && (
                <button
                  type="button"
                  onClick={voice.toggle}
                  aria-pressed={voice.listening}
                  aria-label={voice.listening ? t("tutor.listening") : t("tutor.tapToSpeak")}
                  disabled={busy}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-40 ${voice.listening ? "border-mint bg-mint/15 text-mint" : "border-white/15 text-ink-100 hover:bg-white/10"}`}
                >
                  {voice.listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
              )}
              <Button onClick={() => busy ? abortRef.current?.abort() : ask(input)} disabled={!busy && !input.trim()} icon={busy ? Square : Send} className="h-11" aria-label={busy ? t("tutor.stop") : t("tutor.send")}>
                <span className="hidden sm:inline">{busy ? t("tutor.stop") : t("tutor.send")}</span>
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
              <label className="inline-flex cursor-pointer items-center gap-2 text-ink-300">
                <input type="checkbox" checked={autoSpeak} onChange={(e) => { setAutoSpeak(e.target.checked); if (!e.target.checked) { stopSpeaking(); setSpeakingIndex(null); } }} className="h-4 w-4 accent-[#7c8cff]" />
                {t("tutor.autoSpeak")}
              </label>
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> {t("tutor.privacy")}</span>
            </div>
          </div>
        </section>
      ) : (
        <section id="panel-simplify" role="tabpanel" aria-labelledby="tab-simplify" className="glass-card mt-4 p-5">
          <Simplifier />
        </section>
      )}
    </div>
  );
}
