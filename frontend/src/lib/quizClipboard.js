import { useSyncExternalStore } from "react";
import { apiFetch } from "./api";

// ----------------------------------------------------------------------------
// Quiz clipboard
//
// "Copy Quiz" remembers WHICH quiz the admin picked (plus a small summary to
// show on screen); "Paste Quiz" asks the backend to clone that quiz —
// rounds, questions, options, answers, marks, settings and all — into
// whichever list the admin is on (see backend adminQuizCopyController.js).
//
// Keeping only a reference here (instead of a giant JSON dump of the quiz)
// means the copy is always complete, never hits a size limit, and never puts
// the quiz password hash anywhere in the browser.
//
// The clipboard lives in localStorage so it survives page reloads and is shared
// between browser tabs (copy in one tab, paste in another). If localStorage is
// blocked (private mode / strict browser settings) it transparently falls back
// to an in-memory value, which still works for the current tab.
// ----------------------------------------------------------------------------

const STORAGE_KEY = "quizClipboard.v1";
const CHANGE_EVENT = "quiz-clipboard-change";

export const PLACEMENT_LABELS = { quizzes: "Quiz", landing: "Demo Quiz" };

let memoryRaw = null;
let cachedRaw;
let cachedValue = null;

function readRaw() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return memoryRaw;
  }
}

function writeRaw(raw) {
  memoryRaw = raw;
  try {
    if (raw === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // localStorage unavailable — memoryRaw above keeps it working in this tab.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function parse(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value.id !== "string" || !value.id) return null;
    return {
      id: value.id,
      title: String(value.title ?? "Untitled quiz"),
      placement: value.placement === "landing" ? "landing" : "quizzes",
      status: value.status || "draft",
      roundCount: Number(value.roundCount) || 0,
      questionCount: Number(value.questionCount) || 0,
      optionCount: Number(value.optionCount) || 0,
      copiedAt: Number(value.copiedAt) || 0,
    };
  } catch {
    return null;
  }
}

// useSyncExternalStore needs a referentially-stable snapshot: only re-parse
// when the stored string actually changed.
function getSnapshot() {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parse(raw);
  }
  return cachedValue;
}

function getServerSnapshot() {
  return null;
}

function subscribe(callback) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback); // other tabs
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Current clipboard entry (or null), re-rendering whenever it changes. */
export function useQuizClipboard() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function clearQuizClipboard() {
  writeRaw(null);
}

/**
 * Copy Quiz: verifies the quiz still exists, fetches its summary and puts it
 * on the clipboard. Throws ApiError on failure (caller shows the message).
 */
export async function copyQuizToClipboard(token, quizId) {
  const data = await apiFetch(`/admin/quizzes/${quizId}/copy-info`, { token });
  const entry = { ...data.quiz, copiedAt: Date.now() };
  writeRaw(JSON.stringify(entry));
  return parse(JSON.stringify(entry));
}

/** "3 rounds • 25 questions" style summary used in toasts and the banner. */
export function describeQuizContents(entry) {
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return [plural(entry.roundCount, "round"), plural(entry.questionCount, "question")].join(" • ");
}
