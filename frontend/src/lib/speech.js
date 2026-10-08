/**
 * Browser speech helpers for the voice tutor. Everything runs in the browser
 * (Web Speech API): no audio is uploaded to this platform's server. Chrome and
 * Edge route recognition through their own cloud speech service; the UI says so.
 */
const RECOGNITION_LANG = { en: "en-IN", ta: "ta-IN" };

export function speechRecognitionSupported() {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function speechSynthesisSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

export function hasVoiceFor(lang) {
  if (!speechSynthesisSupported()) return false;
  const voices = window.speechSynthesis.getVoices?.() || [];
  if (!voices.length) return true; // voices load lazily — don't warn prematurely
  return voices.some((v) => v.lang?.toLowerCase().startsWith(lang === "ta" ? "ta" : "en"));
}

/**
 * Starts one recognition session. Returns { stop, abort }.
 * Callbacks: onInterim(text), onFinal(text), onError(code), onEnd().
 */
export function startListening({ lang = "en", onInterim, onFinal, onError, onEnd }) {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) {
    onError?.("unsupported");
    onEnd?.();
    return { stop() {}, abort() {} };
  }
  const rec = new Ctor();
  rec.lang = RECOGNITION_LANG[lang] || "en-IN";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = "";
  let delivered = false;

  rec.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const piece = event.results[i][0]?.transcript || "";
      if (event.results[i].isFinal) finalText += piece;
      else interim += piece;
    }
    if (interim) onInterim?.((finalText + interim).trim());
  };
  rec.onerror = (event) => onError?.(event.error || "error");
  rec.onend = () => {
    if (!delivered && finalText.trim()) {
      delivered = true;
      onFinal?.(finalText.trim());
    } else if (!delivered) {
      onError?.("no-speech");
    }
    onEnd?.();
  };
  try {
    rec.start();
  } catch {
    onError?.("error");
    onEnd?.();
  }
  return { stop: () => rec.stop(), abort: () => rec.abort() };
}

function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices?.() || [];
  const prefix = lang === "ta" ? "ta" : "en";
  return voices.find((v) => v.lang?.toLowerCase().startsWith(prefix)) || null;
}

/** Strips markdown/code so the voice doesn't read symbols out loud. */
export function toSpeakable(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " (code example shown on screen) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function speak(text, { lang = "en", rate = 0.95, onEnd } = {}) {
  if (!speechSynthesisSupported()) return false;
  const clean = toSpeakable(text);
  if (!clean) return false;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(clean.slice(0, 1200));
  utter.lang = lang === "ta" ? "ta-IN" : "en-IN";
  const voice = pickVoice(lang);
  if (voice) utter.voice = voice;
  utter.rate = rate;
  utter.onend = () => onEnd?.();
  utter.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utter);
  return true;
}

export function stopSpeaking() {
  if (speechSynthesisSupported()) window.speechSynthesis.cancel();
}
