import { useCallback, useEffect, useRef, useState } from "react";
import { speechRecognitionSupported, startListening } from "./speech";

/**
 * Push-to-talk voice input. `onResult(text)` fires once with the final
 * transcript. Exposes live interim text and a human-readable error code the
 * UI maps to a translated message.
 */
export function useVoiceInput({ lang, onResult }) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState(null);
  const session = useRef(null);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const stop = useCallback(() => session.current?.stop(), []);

  const start = useCallback(() => {
    if (session.current) return;
    setError(null);
    setInterim("");
    setListening(true);
    session.current = startListening({
      lang,
      onInterim: setInterim,
      onFinal: (text) => onResultRef.current?.(text),
      onError: (code) => setError(code),
      onEnd: () => {
        session.current = null;
        setListening(false);
        setInterim("");
      },
    });
  }, [lang]);

  useEffect(() => () => session.current?.abort(), []);

  return {
    supported: speechRecognitionSupported(),
    listening,
    interim,
    error,
    start,
    stop,
    toggle: () => (session.current ? stop() : start()),
    clearError: () => setError(null),
  };
}
