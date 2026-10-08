import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { aiApi } from "./aiApi";
import { API_URL } from "./api";
import { translate } from "./i18n";
import { useStudentAccountAuth } from "./studentAccountAuth";

const STORAGE_KEY = "quizapp_a11y";

const DEFAULT_SETTINGS = {
  language: "en",
  textSize: "normal", // small | normal | large | xlarge
  highContrast: false,
  simplifiedText: false,
  reduceMotion: false,
  dyslexiaFriendly: false,
  keyboardMode: false,
};

const TEXT_SIZES = ["small", "normal", "large", "xlarge"];

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { settings: DEFAULT_SETTINGS, hadStored: false };
    return { settings: sanitize(JSON.parse(raw)), hadStored: true };
  } catch {
    return { settings: DEFAULT_SETTINGS, hadStored: false };
  }
}

function sanitize(input) {
  const src = input && typeof input === "object" ? input : {};
  const out = { ...DEFAULT_SETTINGS };
  if (src.language === "en" || src.language === "ta") out.language = src.language;
  if (TEXT_SIZES.includes(src.textSize)) out.textSize = src.textSize;
  for (const key of ["highContrast", "simplifiedText", "reduceMotion", "dyslexiaFriendly", "keyboardMode"]) {
    if (typeof src[key] === "boolean") out[key] = src[key];
  }
  return out;
}

/** Writes the settings onto <html> so plain CSS (index.css) can react to them. */
function applyToDocument(settings) {
  const root = document.documentElement;
  root.lang = settings.language === "ta" ? "ta" : "en";
  root.dataset.textSize = settings.textSize;
  root.dataset.contrast = settings.highContrast ? "high" : "normal";
  root.dataset.simple = settings.simplifiedText ? "on" : "off";
  root.dataset.motion = settings.reduceMotion ? "reduce" : "normal";
  root.dataset.dyslexia = settings.dyslexiaFriendly ? "on" : "off";
  root.dataset.keyboard = settings.keyboardMode ? "on" : "off";
}

const AccessibilityContext = createContext(null);

export function AccessibilityProvider({ children }) {
  const [initial] = useState(readStored); // read localStorage once, not on every render
  const [settings, setSettings] = useState(initial.settings);
  const settingsRef = useRef(initial.settings);
  const [syncedToken, setSyncedToken] = useState(null);
  const { token } = useStudentAccountAuth();
  const hadStored = useRef(initial.hadStored);
  const pullDone = useRef(false);
  const pushTimer = useRef(null);

  // Apply + persist locally on every change (works for signed-out visitors too).
  useEffect(() => {
    applyToDocument(settings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* private mode etc. — settings still apply for this session */
    }
  }, [settings]);

  // When a student signs in: a brand-new device adopts the account's saved
  // preferences; a device that already has choices keeps them and pushes them.
  useEffect(() => {
    if (!token) {
      pullDone.current = false;
      return undefined;
    }
    let alive = true;
    aiApi(token)
      .profile()
      .then((data) => {
        if (!alive) return;
        pullDone.current = true;
        setSyncedToken(token);
        const p = data.profile;
        if (!hadStored.current && p) {
          const adopted = sanitize({ ...p.accessibility, language: p.language });
          settingsRef.current = adopted;
          setSettings(adopted);
          hadStored.current = true;
        }
      })
      .catch(() => {
        /* AI tables not migrated yet / offline: local settings still work */
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const pending = useRef(null);

  const queuePush = useCallback(
    (next) => {
      if (!token || !pullDone.current) return;
      pending.current = next;
      clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => {
        const { language, ...accessibility } = next;
        pending.current = null;
        aiApi(token).saveProfile({ language, accessibility }).catch(() => {});
      }, 500);
    },
    [token]
  );

  // If the tab is closed/reloaded inside the debounce window, send the last
  // change anyway (keepalive lets the request outlive the page).
  useEffect(() => {
    const flush = () => {
      if (!pending.current || !token) return;
      const { language, ...accessibility } = pending.current;
      pending.current = null;
      try {
        fetch(`${API_URL}/ai/profile`, {
          method: "PUT",
          keepalive: true,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ language, accessibility }),
        }).catch(() => {});
      } catch {
        /* best effort */
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      clearTimeout(pushTimer.current);
    };
  }, [token]);

  const update = useCallback(
    (patch) => {
      const next = sanitize({ ...settingsRef.current, ...patch });
      settingsRef.current = next;
      hadStored.current = true;
      setSettings(next);
      queuePush(next);
    },
    [queuePush]
  );

  const reset = useCallback(() => update({ ...DEFAULT_SETTINGS, language: settings.language }), [update, settings.language]);

  const synced = Boolean(token) && syncedToken === token;

  const value = useMemo(
    () => ({
      settings,
      update,
      reset,
      synced,
      lang: settings.language,
      t: (key, vars) => translate(settings.language, key, vars),
    }),
    [settings, update, reset, synced]
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error("useAccessibility must be used inside <AccessibilityProvider>");
  return ctx;
}
