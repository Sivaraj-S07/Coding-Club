/**
 * Speaks a list of lines one at a time, with a pause between each, using the
 * browser's built-in SpeechSynthesis API (no server-side TTS service or API
 * key required). Used by the Hint modal to read the line-by-line solution
 * explanation aloud in English or Tamil.
 */
const PAUSE_MS = 2000;

function pickVoice(lang) {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const prefix = lang === "ta" ? "ta" : "en";
  return (
    voices.find((v) => v.lang?.toLowerCase().startsWith(prefix)) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith(prefix === "ta" ? "en" : prefix)) ||
    null
  );
}

function speakOne(text, lang) {
  return new Promise((resolve) => {
    if (!text || !text.trim() || !window.speechSynthesis) return resolve();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang === "ta" ? "ta-IN" : "en-US";
    const voice = pickVoice(lang);
    if (voice) utter.voice = voice;
    utter.rate = 0.95;
    utter.onend = resolve;
    utter.onerror = resolve; // never let a TTS failure hang the sequence
    window.speechSynthesis.speak(utter);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Speaks `lines` (array of strings) sequentially with a pause between each.
 * Returns a controller `{ cancel() }`. Calls `onLineStart(index)` before
 * speaking each line so the UI can highlight the active line.
 */
export function speakLines(lines, { lang = "en", onLineStart, onDone } = {}) {
  let cancelled = false;

  (async () => {
    for (let i = 0; i < lines.length; i++) {
      if (cancelled) break;
      onLineStart?.(i);
      await speakOne(lines[i], lang);
      if (cancelled) break;
      if (i < lines.length - 1) await wait(PAUSE_MS);
    }
    if (!cancelled) onDone?.();
  })();

  return {
    cancel() {
      cancelled = true;
      window.speechSynthesis?.cancel?.();
    },
  };
}

export function isSpeechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
