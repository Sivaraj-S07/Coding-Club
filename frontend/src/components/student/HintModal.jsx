import { useEffect, useState } from "react";
import { Volume2, Square, Lightbulb, Code2, Languages } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { speakLines, isSpeechSupported } from "../../lib/tts";

/**
 * Shows progressive hints, then (on request) the full reference solution
 * with a bilingual (English / Tamil), line-by-line explanation. The "Speak"
 * button reads the explanation aloud one line at a time with a ~2s pause
 * between lines, highlighting the line currently being read.
 */
export default function HintModal({ open, onClose, hint, loading }) {
  const [lang, setLang] = useState("en");
  const [showSolution, setShowSolution] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [activeLine, setActiveLine] = useState(-1);
  const [controller, setController] = useState(null);

  const stopSpeaking = () => {
    controller?.cancel();
    setController(null);
    setSpeaking(false);
    setActiveLine(-1);
  };

  useEffect(() => {
    if (!open) stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => stopSpeaking, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = hint?.explanationLines || [];

  const speak = () => {
    stopSpeaking();
    const texts = lines.map((l) => l[lang] || l.en || "");
    const c = speakLines(texts, {
      lang,
      onLineStart: setActiveLine,
      onDone: () => {
        setSpeaking(false);
        setActiveLine(-1);
      },
    });
    setController(c);
    setSpeaking(true);
  };

  return (
    <Modal open={open} onClose={onClose} title="Hint & Solution" maxWidth="max-w-2xl">
      {loading && <p className="py-8 text-center text-sm text-ink-500">Loading…</p>}

      {!loading && hint && (
        <div className="space-y-5">
          {hint.hints?.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber">
                <Lightbulb className="h-3.5 w-3.5" /> Hints
              </div>
              <ul className="space-y-2">
                {hint.hints.map((h, i) => (
                  <li key={i} className="rounded-xl border border-amber/20 bg-amber/[0.06] px-3.5 py-2.5 text-sm text-ink-200">
                    {lang === "ta" && h.ta ? h.ta : h.en}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="inline-flex rounded-lg border hairline bg-white/5 p-0.5">
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${lang === "en" ? "bg-electric/20 text-electric-light" : "text-ink-500 hover:text-ink-100"}`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLang("ta")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${lang === "ta" ? "bg-electric/20 text-electric-light" : "text-ink-500 hover:text-ink-100"}`}
              >
                தமிழ்
              </button>
            </div>

            {!showSolution && (
              <Button size="sm" variant="secondary" onClick={() => setShowSolution(true)}>
                <Code2 className="h-4 w-4" /> Show correct solution
              </Button>
            )}
          </div>

          {showSolution && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Solution ({hint.solutionLanguage})
                </span>
                {isSpeechSupported() && lines.length > 0 && (
                  <button
                    type="button"
                    onClick={speaking ? stopSpeaking : speak}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-violet/15 px-3 py-1.5 text-xs font-medium text-violet-soft transition-colors hover:bg-violet/25"
                  >
                    {speaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                    {speaking ? "Stop" : "Speak"}
                  </button>
                )}
              </div>

              <pre className="max-h-64 overflow-auto rounded-xl border hairline bg-black/40 p-3 font-mono text-xs leading-relaxed text-ink-200">
                {hint.referenceSolution || "(no reference solution)"}
              </pre>

              {lines.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                    <Languages className="h-3.5 w-3.5" /> Line-by-line explanation
                  </div>
                  <ol className="space-y-1.5">
                    {lines.map((l, i) => (
                      <li
                        key={i}
                        className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                          activeLine === i ? "border-electric/50 bg-electric/10 text-ink-100" : "hairline bg-white/[0.02] text-ink-300"
                        }`}
                      >
                        <code className="mb-1 block font-mono text-[11px] text-ink-500">{l.code}</code>
                        {lang === "ta" && l.ta ? l.ta : l.en}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
