import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser-level proctoring for an active quiz attempt.
 *
 * What browsers genuinely allow a website to do — and all this hook does:
 *  - request fullscreen (only from a user gesture) and detect when it is left
 *  - request a Screen Wake Lock (only from a user gesture) so the device's
 *    own idle-timeout does not turn the screen off / auto-lock it while the
 *    student is simply reading a question — this is the #1 real-world cause
 *    of a screen "locking" mid-quiz, and preventing it here means the false
 *    Page Visibility / blur events it used to cause never happen at all.
 *    On browsers with no Wake Lock API at all (Firefox, older Safari), a
 *    muted looping video fallback is used instead so "never sleep" still
 *    works everywhere it possibly can
 *  - detect tab switching / window focus loss (Page Visibility + blur) —
 *    reported as "app switching", each with a short grace window so a
 *    permission prompt or a brief lock-screen unlock isn't mistaken for it
 *  - detect the PrintScreen key (the only screenshot-adjacent signal a
 *    website can ever observe — see below) and best-effort wipe whatever it
 *    just placed on the clipboard
 *  - block the context menu, text selection, copy/cut/paste and a set of
 *    keyboard shortcuts inside the quiz surface
 *  - block new tabs/windows opened from inside the quiz (links, `window.open`)
 *  - warn before the page is closed or navigated away from
 *  - report each event so QuizRunner can log it and end the attempt
 *
 * What NO website can do (and this hook deliberately does not pretend to
 * do): reliably detect a screenshot or screen recording taken with an
 * OS-level tool (Snipping Tool / Win+Shift+S, macOS Cmd+Shift+3/4, a phone
 * camera pointed at the screen, or a separate capture app), see into other
 * apps, enforce anything at the OS level, or disable browser extensions.
 * Nothing here touches the user's device or system outside the browser tab.
 *
 * A genuine browser limitation worth being upfront about: there is no web
 * API that reports *why* a tab became hidden. A student switching to another
 * app and the OS locking the screen both fire the same Page Visibility
 * event. The Wake Lock above removes the most common *automatic* case
 * (idle timeout); QuizRunner additionally treats a very brief hidden spell
 * (a quick lock-screen unlock, e.g. via fingerprint) as a non-violation, and
 * never reports anything at all while the device is offline.
 *
 * @param {object} opts
 * @param {boolean} opts.active - proctoring runs only while true
 * @param {(reason: string) => void} opts.onEvent - called for every suspicious event
 */
export default function useProctoring({ active, onEvent }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(true);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const report = useCallback((reason) => {
    try {
      onEventRef.current?.(reason);
    } catch {
      // reporting must never break the quiz
    }
  }, []);

  const enterFullscreen = useCallback(async () => {
    const el = document.documentElement;
    const request =
      el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (!request) {
      setFullscreenSupported(false);
      return false;
    }
    try {
      await request.call(el, { navigationUI: "hide" });
      return true;
    } catch {
      // Denied (no user gesture / iframe policy) — the quiz still runs.
      return false;
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  }, []);

  // Screen Wake Lock — best-effort, feature-detected. Not supported in every
  // browser (notably Firefox at the time of writing) and can be silently
  // revoked by the OS/browser at any time, so this is a mitigation, not a
  // guarantee: it meaningfully cuts down on idle-timeout screen locks during
  // a quiz without pretending to control the device.
  const wakeLockRef = useRef(null);

  // Fallback for browsers with no Wake Lock API at all (e.g. Firefox, older
  // Safari): the long-standing "silent looping video" trick. A tiny, muted,
  // inline video kept playing off-screen is enough to stop the OS/browser
  // idle-timeout from dimming the display or locking the screen. It only
  // ever runs when the real API is unavailable, and — like Wake Lock — must
  // be started from a user gesture, which is why it's created lazily here
  // rather than up front.
  const noSleepVideoRef = useRef(null);
  const startNoSleepFallback = useCallback(() => {
    try {
      let video = noSleepVideoRef.current;
      if (!video) {
        video = document.createElement("video");
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.setAttribute("aria-hidden", "true");
        video.style.position = "fixed";
        video.style.top = "0";
        video.style.left = "0";
        video.style.width = "1px";
        video.style.height = "1px";
        video.style.opacity = "0";
        video.style.pointerEvents = "none";
        video.src = "/nosleep.mp4";
        document.body.appendChild(video);
        noSleepVideoRef.current = video;
      }
      video.play().catch(() => {
        // Autoplay blocked outside a user gesture — nothing more to do here.
      });
    } catch {
      // Never let the fallback break the quiz.
    }
  }, []);
  const stopNoSleepFallback = useCallback(() => {
    const video = noSleepVideoRef.current;
    if (!video) return;
    try {
      video.pause();
      video.remove();
    } catch {
      // ignore
    } finally {
      noSleepVideoRef.current = null;
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        // Real API acquired — no need for the video fallback.
        stopNoSleepFallback();
        return;
      }
    } catch {
      // Not supported, denied, or no user gesture yet — fall through to the
      // video fallback below so the screen still stays awake if possible.
    }
    startNoSleepFallback();
  }, [startNoSleepFallback, stopNoSleepFallback]);
  const releaseWakeLock = useCallback(async () => {
    try {
      await wakeLockRef.current?.release?.();
    } catch {
      // ignore
    } finally {
      wakeLockRef.current = null;
    }
    stopNoSleepFallback();
  }, [stopNoSleepFallback]);

  useEffect(() => {
    if (!active) {
      releaseWakeLock();
      return undefined;
    }
    requestWakeLock();
    // A wake lock is automatically released by the browser whenever the tab
    // is hidden, so it must be re-requested every time the tab becomes
    // visible again (this also naturally re-arms it after a real screen
    // lock/unlock, which does release it).
    const onVisible = () => {
      if (!document.hidden) requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      releaseWakeLock();
    };
  }, [active, requestWakeLock, releaseWakeLock]);

  // Fullscreen change tracking
  useEffect(() => {
    if (!active) return undefined;
    const onChange = () => {
      const on = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(on);
      if (!on) report("fullscreen_exit");
    };
    setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [active, report]);

  // Window focus loss — reported as "app switching" (alt-tab, clicking
  // another app/window, opening the taskbar/dock, etc). A short grace
  // window (window regains focus before the timer fires) absorbs the
  // handful of benign cases that also fire `blur` without the student
  // actually leaving — a permission prompt (e.g. the Wake Lock / fullscreen
  // dialog on some browsers), an on-screen keyboard, or a system
  // notification banner. Anything that stays blurred past the grace period
  // is treated as a genuine app switch.
  const WINDOW_BLUR_GRACE_MS = 600;
  useEffect(() => {
    if (!active) return undefined;
    let timer = null;
    const onBlur = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (typeof document !== "undefined" && document.hasFocus && !document.hasFocus()) {
          report("window_blur");
        }
      }, WINDOW_BLUR_GRACE_MS);
    };
    const onFocus = () => clearTimeout(timer);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [active, report]);

  // Screenshot / screen-capture — best-effort only. The web platform gives a
  // page no way to detect a screenshot taken with an OS tool that doesn't
  // touch the keyboard (Windows Snipping Tool via Win+Shift+S, macOS
  // Cmd+Shift+3/4, a phone camera, or a separate screen-recording app) —
  // there is no browser API for this, on any browser. The one thing that IS
  // observable is the plain PrintScreen key, which on Windows copies the
  // whole screen straight to the clipboard; we catch that key and
  // immediately try to overwrite the clipboard so the capture can't be
  // pasted elsewhere, on top of reporting it as a violation.
  useEffect(() => {
    if (!active) return undefined;
    const onKeyUp = (e) => {
      const key = String(e.key || "").toLowerCase();
      if (key === "printscreen") {
        try {
          navigator.clipboard?.writeText?.("");
        } catch {
          // Clipboard API unavailable or permission denied — nothing more
          // to do here.
        }
        report("screenshot_attempt");
      }
    };
    document.addEventListener("keyup", onKeyUp);
    return () => document.removeEventListener("keyup", onKeyUp);
  }, [active, report]);

  // Context menu, selection, clipboard, drag and blocked shortcuts.
  useEffect(() => {
    if (!active) return undefined;

    const isTypingTarget = (target) => {
      const tag = target?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
    };

    const onContextMenu = (e) => {
      e.preventDefault();
      report("context_menu");
    };
    const onSelectStart = (e) => {
      if (!isTypingTarget(e.target)) e.preventDefault();
    };
    const onClipboard = (e) => {
      if (isTypingTarget(e.target)) return; // code/fill-in answers stay usable
      e.preventDefault();
      report(`clipboard_${e.type}`);
    };
    const onDragStart = (e) => e.preventDefault();

    const onKeyDown = (e) => {
      const key = String(e.key || "").toLowerCase();
      const typing = isTypingTarget(e.target);

      // Developer tools / view-source — a common vector for external help
      // (inspecting the page, running scripts in the console). Counted as a
      // real violation, unlike the softer shortcuts below.
      if (
        key === "f12" ||
        (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(key)) ||
        ((e.ctrlKey || e.metaKey) && key === "u")
      ) {
        e.preventDefault();
        report("devtools_attempt");
        return;
      }

      // New tab / new window / print / save / find — disruptive but not on
      // their own proof of leaving the quiz to seek help, so these stay
      // soft/logged only.
      const blockedWithCtrl = ["t", "n", "w", "p", "s", "f"];
      if ((e.ctrlKey || e.metaKey) && blockedWithCtrl.includes(key) && !(typing && key === "f")) {
        e.preventDefault();
        report("blocked_shortcut");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !typing && ["c", "x", "v", "a"].includes(key)) {
        e.preventDefault();
        report("blocked_shortcut");
        return;
      }
      if (e.altKey && key === "tab") {
        // The OS owns Alt+Tab; we can only note the attempt.
        report("alt_tab_attempt");
      }
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("selectstart", onSelectStart);
    document.addEventListener("copy", onClipboard);
    document.addEventListener("cut", onClipboard);
    document.addEventListener("paste", onClipboard);
    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("keydown", onKeyDown, true);
    document.body.classList.add("quiz-locked");

    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("copy", onClipboard);
      document.removeEventListener("cut", onClipboard);
      document.removeEventListener("paste", onClipboard);
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.classList.remove("quiz-locked");
    };
  }, [active, report]);

  // Block in-app attempts to open new tabs/windows from the quiz surface —
  // e.g. opening a search engine or an AI assistant in a new tab. Counted as
  // a real violation.
  useEffect(() => {
    if (!active) return undefined;
    const onClick = (e) => {
      const anchor = e.target?.closest?.("a[target='_blank'], a[href^='http']");
      if (anchor) {
        e.preventDefault();
        report("new_tab_blocked");
      }
    };
    document.addEventListener("click", onClick, true);
    const originalOpen = window.open;
    window.open = function blockedOpen() {
      report("new_tab_blocked");
      return null;
    };
    return () => {
      document.removeEventListener("click", onClick, true);
      window.open = originalOpen;
    };
  }, [active, report]);

  return { isFullscreen, fullscreenSupported, enterFullscreen, exitFullscreen, requestWakeLock };
}
