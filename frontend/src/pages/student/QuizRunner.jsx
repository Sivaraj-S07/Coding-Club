import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, Send, Loader2, SkipForward, Maximize, LogOut } from "lucide-react";
import Timer from "../../components/Timer";
import QuestionTimer from "../../components/QuestionTimer";
import QuestionPalette from "../../components/QuestionPalette";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Modal from "../../components/ui/Modal";
import { useToast } from "../../components/ui/Toast";
import QuizInstructions from "../../components/QuizInstructions";
import { apiFetch, ApiError } from "../../lib/api";
import { getStudentSession, clearStudentSession } from "../../lib/studentAuth";
import useProctoring from "../../hooks/useProctoring";
import { useLiveConnectionMonitor } from "../../hooks/useNetworkQuality";
import CodingWorkspace from "../../components/student/CodingWorkspace";

const LANGUAGE_LABELS = { c: "C", cpp: "C++", java: "Java", python: "Python" };
const CODE_SAVE_DEBOUNCE_MS = 700;

// These proctoring reasons are quiz-security violations: screenshots, tab
// switching, app switching, leaving the quiz, and any third-party site/tab
// activity. A single occurrence of any of them ends the attempt immediately
// — the server is the authority on which reasons count as "hard" (see
// HARD_REASONS in quizAttemptController.js); this copy only decides local
// UI copy/behaviour and is never trusted for the actual logout decision.
const HARD_VIOLATION_REASONS = new Set([
  "tab_switch",
  "window_blur",
  "fullscreen_exit",
  "navigation_attempt",
  "new_tab_blocked",
  "devtools_attempt",
  "screenshot_attempt",
]);

// Per-question time limit comes from the question itself (set by the admin in
// the Admin Portal). null / 0 means this question has no individual limit.
function questionLimitSeconds(question) {
  const limit = Number(question?.timeLimitSeconds || 0);
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

export default function QuizRunner() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const session = getStudentSession(quizId);

  // Mandatory first-time instruction slider (static frontend content).
  // Once acknowledged, it is not shown again for this attempt/tab.
  const instructionsKey = `quizapp_instructions_${quizId}`;
  const [instructionsDone, setInstructionsDone] = useState(() => {
    try {
      return sessionStorage.getItem(instructionsKey) === "1";
    } catch {
      return false;
    }
  });


  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [roundBanner, setRoundBanner] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [violationsCount, setViolationsCount] = useState(0);
  const [tabSwitchLimit, setTabSwitchLimit] = useState(3);

  const [current, setCurrent] = useState(0);
  const [selections, setSelections] = useState({}); // questionId -> optionId (mcq) | code string (coding) | string[] (fill_blank)
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [violationBanner, setViolationBanner] = useState(null);
  const [fullscreenPrompt, setFullscreenPrompt] = useState(false);
  const [logoutInfo, setLogoutInfo] = useState(null); // { message } — set when a proctoring violation force-ends the attempt

  // Height of the sticky quiz header (title + timer), measured live so the
  // code editor's own full-screen overlay can start right below it instead
  // of covering it — otherwise the countdown timer disappears (and the
  // editor's Exit full screen control lands underneath the header,
  // unreachable) whenever a student expands a coding question to full
  // screen. Re-measured on resize/orientation change since the header's
  // height differs a little between mobile and desktop layouts.
  const quizHeaderRef = useRef(null);
  const [quizHeaderHeight, setQuizHeaderHeight] = useState(0);
  useLayoutEffect(() => {
    const el = quizHeaderRef.current;
    if (!el) return undefined;
    const measure = () => setQuizHeaderHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Per-question timer state.
  // The deadline for every question is issued and owned by the SERVER
  // (question_timings). The browser only renders the countdown, so refreshing,
  // reopening the tab or editing values in dev tools cannot buy extra time —
  // the backend rejects answers once its own deadline has passed.
  const [questionSecondsLeft, setQuestionSecondsLeft] = useState(0);
  const [expiredQuestionIds, setExpiredQuestionIds] = useState(() => new Set());
  const [questionDeadlines, setQuestionDeadlines] = useState({}); // questionId -> epoch ms
  const serverOffsetRef = useRef(0); // serverNow - clientNow
  const serverNow = useCallback(() => Date.now() + serverOffsetRef.current, []);
  const activatingRef = useRef({});

  const markExpired = useCallback((qid) => {
    setExpiredQuestionIds((prev) => {
      if (prev.has(qid)) return prev;
      const next = new Set(prev);
      next.add(qid);
      return next;
    });
  }, []);

  const submittedRef = useRef(false);
  const codeSaveTimers = useRef({});
  const flushPendingCodeRef = useRef(async () => {});

  // Connectivity tracking — a temporary internet disconnection must never
  // count as a proctoring violation or log the student out. offlineRef is
  // read synchronously (no re-render needed) by the reporting/visibility
  // logic below.
  const offlineRef = useRef(typeof navigator !== "undefined" ? !navigator.onLine : false);
  // Only the connectivity status itself is checked (navigator.onLine) — no
  // other system/device access is requested anywhere in the quiz flow. This
  // also drives a small visible indicator so the student can tell a
  // connection drop from an actual security violation.
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  useEffect(() => {
    const onOnline = () => {
      offlineRef.current = false;
      setIsOnline(true);
    };
    const onOffline = () => {
      offlineRef.current = true;
      setIsOnline(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // ---------------------------------------------------------------------
  // Network Quality Protection
  //
  // A richer signal than the raw browser online/offline flag above — this
  // also catches a "connected but unreachable" network via periodic health
  // pings, and drives the pause/reconnect-overlay/auto-save behaviour below.
  // The simpler `isOnline`/`offlineRef` signal above is left completely
  // untouched: proctoring still exempts violations using exactly the same
  // check it always has.
  // ---------------------------------------------------------------------
  const [connectionLost, setConnectionLost] = useState(false);
  const outageStartedAtRef = useRef(null);
  // Answers that failed to reach the server while disconnected — cached
  // locally (in-memory + localStorage) and auto-saved to the server the
  // moment the connection is confirmed back.
  const pendingAnswersRef = useRef({}); // questionId -> { optionId, code, blanks }
  const pendingStorageKey = `quizapp_pending_answers_${quizId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(pendingStorageKey);
      pendingAnswersRef.current = raw ? JSON.parse(raw) || {} : {};
    } catch {
      pendingAnswersRef.current = {};
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);
  const savePendingAnswers = useCallback(() => {
    try {
      localStorage.setItem(pendingStorageKey, JSON.stringify(pendingAnswersRef.current));
    } catch {
      // localStorage unavailable (private mode, quota) — the in-memory copy
      // still gets flushed for the rest of this tab session.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStorageKey]);
  // A continuous, lightweight local backup of every current answer so a
  // crashed tab / closed browser while offline never loses typed work —
  // purely a safety net, never read back into UI state (the server, once
  // reachable, remains the single source of truth on load).
  useEffect(() => {
    try {
      localStorage.setItem(`quizapp_answers_backup_${quizId}`, JSON.stringify(selections));
    } catch {
      // best-effort only
    }
  }, [quizId, selections]);

  const handleSubmit = useCallback(
    async (silent = false) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        await flushPendingCodeRef.current();
        const data = await apiFetch(`/quizzes/${quizId}/submit`, { method: "POST", token: session.token });
        clearStudentSession(quizId);
        if (!silent) push("Quiz submitted!", "success");
        // Hand the freshly graded result to the result page so the score is
        // visible immediately, with no second round-trip or refresh.
        navigate(`/result/${quizId}`, { replace: true, state: { result: data?.result || null } });
      } catch (err) {
        push(err instanceof ApiError ? err.message : "Failed to submit quiz", "error");
        submittedRef.current = false;
        setSubmitting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quizId, session?.token]
  );

  // Ends only this device's quiz session — the attempt itself (answers,
  // current question, timers) is left exactly as-is on the server, still
  // `in_progress`, so logging back in (same device or a different one, with
  // the same Register Number) resumes from precisely where this leaves off.
  // This is deliberately NOT the same as Submit quiz: nothing is graded and
  // no attempt is used up.
  const handleLogoutSession = useCallback(async () => {
    setLoggingOut(true);
    try {
      if (session?.token) {
        await apiFetch("/students/logout", { method: "POST", token: session.token }).catch(() => {
          // Best-effort — even if this call fails (e.g. offline), still log
          // the student out locally so they aren't stuck on this page.
        });
      }
      clearStudentSession(quizId);
      push("Logged out. Log back in any time to resume this quiz.", "success");
      navigate(`/login/${quizId}`, { replace: true });
    } finally {
      setLoggingOut(false);
      setConfirmLogout(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId, session?.token]);

  useEffect(() => {
    if (!session?.token) {
      navigate(`/login/${quizId}`, { replace: true });
      return;
    }
    // Hold the attempt (and its timer) until the instructions are acknowledged.
    if (!instructionsDone) return;
    let cancelled = false;
    async function start() {
      try {
        const data = await apiFetch(`/quizzes/${quizId}/start`, { method: "POST", token: session.token });
        if (cancelled) return;
        setQuiz(data.quiz);
        // Attach the last judge verdict so the workspace shows it after a refresh.
        const codeAnswers = data.codeAnswers || {};
        setQuestions(
          (data.questions || []).map((q) =>
            q.type === "coding" && codeAnswers[q.id] ? { ...q, judge: codeAnswers[q.id].judge } : q
          )
        );
        const restoredCode = {};
        Object.entries(codeAnswers).forEach(([qid, entry]) => {
          if (entry && typeof entry.code === "string") restoredCode[qid] = entry.code;
        });
        if (Object.keys(restoredCode).length) {
          setSelections((sel) => ({ ...restoredCode, ...sel }));
        }
        setRounds(data.rounds || []);
        setRemainingSeconds(data.remainingSeconds);
        setViolationsCount(data.violationsCount);
        setTabSwitchLimit(data.quiz.tabSwitchLimit);
        if (data.serverTime) {
          serverOffsetRef.current = new Date(data.serverTime).getTime() - Date.now();
        }
        // Restore timers + position exactly as the server remembers them, so a
        // refresh continues the attempt instead of restarting anything.
        const deadlines = {};
        const expired = new Set();
        (data.questionTimers || []).forEach((t) => {
          if (t.expiresAt) deadlines[t.questionId] = new Date(t.expiresAt).getTime();
          if (t.expired) expired.add(t.questionId);
        });
        setQuestionDeadlines(deadlines);
        setExpiredQuestionIds(expired);
        const restored = Number(data.currentIndex || 0);
        setCurrent(
          Number.isFinite(restored)
            ? Math.min(Math.max(0, restored), Math.max(0, (data.questions || []).length - 1))
            : 0
        );
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 410) {
          push("Time was already up for this attempt — showing your result.", "warning");
          navigate(`/result/${quizId}`, { replace: true });
          return;
        }
        push(err instanceof ApiError ? err.message : "Failed to start quiz", "error");
        navigate("/", { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    start();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId, instructionsDone]);


  const answeredIds = useMemo(
    () =>
      new Set(
        Object.entries(selections)
          .filter(([, value]) => {
            if (Array.isArray(value)) return value.some((v) => String(v || "").trim().length > 0);
            if (typeof value === "string") return value.trim().length > 0;
            return Boolean(value);
          })
          .map(([key]) => key)
      ),
    [selections]
  );

  const persistAnswer = useCallback(
    async (questionId, optionId, code, blanks) => {
      try {
        const body = { questionId };
        if (optionId !== undefined) body.optionId = optionId;
        if (code !== undefined) body.code = code;
        if (blanks !== undefined) body.blanks = blanks;
        await apiFetch(`/quizzes/${quizId}/answer`, {
          method: "POST",
          token: session.token,
          body,
        });
        // Succeeded — this question no longer needs to be retried once
        // reconnected.
        if (pendingAnswersRef.current[questionId]) {
          delete pendingAnswersRef.current[questionId];
          savePendingAnswers();
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 410) {
          push("Time is up — submitting your quiz now.", "warning");
          handleSubmit(true);
        } else if (err instanceof ApiError && err.status === 403) {
          // The server's clock says this question is already over.
          markExpired(questionId);
          push("Time for this question is over.", "warning");
        } else {
          // Network Quality Protection: a dropped/unreachable connection
          // (ApiError with status 0, or any other network-level failure) —
          // cache this answer locally and auto-save it the moment the
          // connection is confirmed back, instead of silently losing it.
          pendingAnswersRef.current[questionId] = { optionId, code, blanks };
          savePendingAnswers();
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quizId, session?.token, handleSubmit, markExpired, savePendingAnswers]
  );

  // Retries every locally-queued answer once the connection is confirmed
  // back — called after Network Quality Protection detects a reconnect.
  const flushPendingAnswers = useCallback(async () => {
    const entries = Object.entries(pendingAnswersRef.current);
    if (!entries.length) return;
    await Promise.all(
      entries.map(([questionId, a]) => persistAnswer(questionId, a.optionId, a.code, a.blanks))
    );
  }, [persistAnswer]);

  // After a reconnect, re-syncs the clock-sensitive state the server owns
  // (overall time remaining, per-question deadlines, violation count) using
  // the same idempotent endpoint the page already calls on load — it never
  // resets progress. `current` (which question is showing) is deliberately
  // left untouched here: it already survived the outage unchanged in this
  // tab, which is exactly what "resume on the same question" means.
  const resyncAfterReconnect = useCallback(async () => {
    if (!session?.token || submittedRef.current) return;
    try {
      const data = await apiFetch(`/quizzes/${quizId}/start`, { method: "POST", token: session.token });
      if (data.serverTime) {
        serverOffsetRef.current = new Date(data.serverTime).getTime() - Date.now();
      }
      if (typeof data.remainingSeconds === "number") setRemainingSeconds(data.remainingSeconds);
      if (typeof data.violationsCount === "number") setViolationsCount(data.violationsCount);
      const deadlines = {};
      const expired = new Set();
      (data.questionTimers || []).forEach((t) => {
        if (t.expiresAt) deadlines[t.questionId] = new Date(t.expiresAt).getTime();
        if (t.expired) expired.add(t.questionId);
      });
      setQuestionDeadlines((prev) => ({ ...prev, ...deadlines }));
      setExpiredQuestionIds((prev) => new Set([...prev, ...expired]));
      await flushPendingAnswers();
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        push("Time was already up while you were disconnected — showing your result.", "warning");
        submittedRef.current = true;
        clearStudentSession(quizId);
        navigate(`/result/${quizId}`, { replace: true });
        return;
      }
      // Still not really reachable (e.g. the online event fired early) —
      // the live monitor's next heartbeat will retry this automatically.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId, session?.token, flushPendingAnswers, navigate]);

  const handleConnectionLost = useCallback(() => {
    outageStartedAtRef.current = Date.now();
    setConnectionLost(true);
  }, []);
  const handleConnectionRestored = useCallback(() => {
    setConnectionLost(false);
    outageStartedAtRef.current = null;
    resyncAfterReconnect();
  }, [resyncAfterReconnect]);

  // Only monitors once the attempt is actually running — not during the
  // mandatory instructions slider, which has its own pre-start network
  // check (see QuizInstructions).
  useLiveConnectionMonitor({
    enabled: instructionsDone,
    onLost: handleConnectionLost,
    onRestored: handleConnectionRestored,
  });

  const selectOption = (questionId, optionId) => {
    if (expiredQuestionIds.has(questionId)) return;
    setSelections((s) => ({ ...s, [questionId]: optionId }));
    persistAnswer(questionId, optionId);
  };

  const updateCode = (questionId, code) => {
    if (expiredQuestionIds.has(questionId)) return;
    setSelections((s) => ({ ...s, [questionId]: code }));
    clearTimeout(codeSaveTimers.current[questionId]);
    codeSaveTimers.current[questionId] = setTimeout(() => {
      persistAnswer(questionId, undefined, code);
    }, CODE_SAVE_DEBOUNCE_MS);
  };

  const updateBlank = (questionId, blankIdx, value, blanksCount) => {
    if (expiredQuestionIds.has(questionId)) return;
    setSelections((s) => {
      const prev = Array.isArray(s[questionId]) ? s[questionId] : Array(blanksCount).fill("");
      const next = [...prev];
      next[blankIdx] = value;
      return { ...s, [questionId]: next };
    });
    clearTimeout(codeSaveTimers.current[questionId]);
    codeSaveTimers.current[questionId] = setTimeout(() => {
      setSelections((s) => {
        persistAnswer(questionId, undefined, undefined, s[questionId]);
        return s;
      });
    }, CODE_SAVE_DEBOUNCE_MS);
  };

  // Ensures the very latest keystrokes are saved even if the debounce timer
  // hasn't fired yet — called right before submitting the quiz.
  const flushPendingCode = useCallback(async () => {
    const debouncedQuestions = questions.filter((q) => q.type === "coding" || q.type === "fill_blank");
    await Promise.all(
      debouncedQuestions.map((q) => {
        const timerId = codeSaveTimers.current[q.id];
        if (timerId) clearTimeout(timerId);
        const value = selections[q.id];
        if (value === undefined) return null;
        return q.type === "fill_blank"
          ? persistAnswer(q.id, undefined, undefined, value)
          : persistAnswer(q.id, undefined, value);
      })
    );
  }, [questions, selections, persistAnswer]);
  flushPendingCodeRef.current = flushPendingCode;

  // Activate the current question on the server the moment it becomes visible.
  // The call is idempotent: the server returns the SAME deadline it issued the
  // first time, so refreshing the page never restarts the countdown.
  useEffect(() => {
    if (loading || submitting || submittedRef.current) return;
    const currentQuestion = questions[current];
    if (!currentQuestion) return;
    const qid = currentQuestion.id;
    if (!questionLimitSeconds(currentQuestion)) return;
    if (questionDeadlines[qid] || expiredQuestionIds.has(qid)) return;
    if (activatingRef.current[qid]) return;
    activatingRef.current[qid] = true;

    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(`/quizzes/${quizId}/question/start`, {
          method: "POST",
          token: session.token,
          body: { questionId: qid },
        });
        if (cancelled) return;
        if (data.serverTime) {
          serverOffsetRef.current = new Date(data.serverTime).getTime() - Date.now();
        }
        const timing = data.timing || {};
        if (timing.expiresAt) {
          setQuestionDeadlines((prev) => ({ ...prev, [qid]: new Date(timing.expiresAt).getTime() }));
        }
        if (timing.expired) markExpired(qid);
        if (typeof data.quizRemainingSeconds === "number") {
          setRemainingSeconds(data.quizRemainingSeconds);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 410) {
          push("Time is up — submitting your quiz now.", "warning");
          handleSubmit(true);
        }
      } finally {
        activatingRef.current[qid] = false;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, loading, submitting, questions, questionDeadlines, expiredQuestionIds]);

  // Render the countdown from the server-issued deadline. When it hits zero the
  // question is locked and the quiz moves on automatically — no refresh needed.
  useEffect(() => {
    if (loading || submitting || submittedRef.current) return;
    // Network Quality Protection: frozen while the connection is confirmed
    // lost — the displayed countdown simply stops advancing instead of
    // ticking down while the student can't act on it anyway. It resumes
    // (and, if needed, jumps straight to "time's up") the moment this
    // effect re-runs after reconnection.
    if (connectionLost) return;
    const currentQuestion = questions[current];
    if (!currentQuestion) return;
    const qid = currentQuestion.id;
    const limit = questionLimitSeconds(currentQuestion);

    if (!limit) {
      setQuestionSecondsLeft(0);
      return;
    }
    if (expiredQuestionIds.has(qid)) {
      setQuestionSecondsLeft(0);
      return;
    }
    const deadline = questionDeadlines[qid];
    if (!deadline) {
      setQuestionSecondsLeft(limit);
      return;
    }

    const tick = () => {
      const left = Math.ceil((deadline - serverNow()) / 1000);
      if (left > 0) {
        setQuestionSecondsLeft(Math.min(limit, left));
        return;
      }
      setQuestionSecondsLeft(0);
      markExpired(qid);
      if (isRoundBoundary(current) && roundIsGated(questions[current]?.roundId)) {
        completeRoundAndContinue(current);
        return;
      }
      setCurrent((c) => (c < questions.length - 1 ? c + 1 : c));
    };
    tick();
    const intervalId = setInterval(tick, 250);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, loading, submitting, questions, questionDeadlines, expiredQuestionIds, connectionLost]);

  // Keep the quiz inside this page: warn on refresh/close and neutralise the
  // browser Back button while an attempt is running.
  useEffect(() => {
    if (loading || submittedRef.current) return;
    const onBeforeUnload = (e) => {
      if (submittedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    const onPopState = () => {
      if (submittedRef.current) return;
      window.history.pushState({ quizLock: true }, "", window.location.href);
      push("Finish and submit the quiz before leaving this page.", "warning");
      reportProctorEvent("navigation_attempt");
    };
    window.history.pushState({ quizLock: true }, "", window.location.href);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ---------------------------------------------------------------------
  // Rounds & qualification
  //
  // Questions are delivered round by round. When the last question of a round
  // that has a qualification percentage is finished, the server grades that
  // round: clearing it unlocks the next round, falling short ends the attempt
  // and shows the final scoreboard.
  // ---------------------------------------------------------------------
  const roundById = useMemo(() => {
    const map = {};
    (rounds || []).forEach((r) => {
      map[r.id] = r;
    });
    return map;
  }, [rounds]);

  const roundIdAt = useCallback((index) => questions[index]?.roundId || null, [questions]);

  // Questions are grouped by the rounds/levels the admin created, in the order
  // they are delivered. Each group becomes "Level N — <round name>" so the
  // student sees each level's questions separately.
  const levelGroups = useMemo(() => {
    const groups = [];
    questions.forEach((q, index) => {
      const roundId = q.roundId || null;
      const last = groups[groups.length - 1];
      if (last && last.roundId === roundId) {
        last.indices.push(index);
        return;
      }
      groups.push({ roundId, indices: [index] });
    });
    let levelNumber = 0;
    return groups.map((g, i) => {
      const round = g.roundId ? roundById[g.roundId] : null;
      if (g.roundId) levelNumber += 1;
      const name = round?.name || (g.roundId ? `Round ${levelNumber}` : "Other questions");
      return {
        ...g,
        key: g.roundId || `unassigned-${i}`,
        level: g.roundId ? levelNumber : null,
        name,
        label: g.roundId ? `Level ${levelNumber} — ${name}` : name,
      };
    });
  }, [questions, roundById]);

  const currentLevel = useMemo(
    () => levelGroups.find((g) => g.indices.includes(current)) || null,
    [levelGroups, current]
  );
  const currentLevelPosition = currentLevel ? currentLevel.indices.indexOf(current) + 1 : 0;

  // Index is the last question of its round (and a next round follows).
  const isRoundBoundary = useCallback(
    (index) => {
      const roundId = roundIdAt(index);
      if (!roundId) return false;
      if (index >= questions.length - 1) return false;
      return roundIdAt(index + 1) !== roundId;
    },
    [questions.length, roundIdAt]
  );

  const roundIsGated = useCallback(
    (roundId) => Number(roundById[roundId]?.qualificationPercentage || 0) > 0,
    [roundById]
  );

  const finishingRound = useRef(false);

  // Moves past a round boundary, asking the server whether the student
  // qualified for the next round.
  const completeRoundAndContinue = useCallback(
    async (index) => {
      const roundId = roundIdAt(index);
      if (!roundId || finishingRound.current) return;
      finishingRound.current = true;
      try {
        await flushPendingCodeRef.current();
        const data = await apiFetch(`/quizzes/${quizId}/round/complete`, {
          method: "POST",
          token: session.token,
          body: { roundId },
        });
        const outcome = data.roundOutcome || {};
        if (data.finished) {
          submittedRef.current = true;
          clearStudentSession(quizId);
          navigate(`/result/${quizId}`, {
            replace: true,
            state: {
              result: data.result || null,
              finishedEarly: true,
              roundOutcome: outcome,
              message: data.message || "You have finished.",
            },
          });
          return;
        }
        setRoundBanner(
          `${outcome.roundName || "Round"} cleared — ${outcome.correct}/${outcome.totalQuestions} correct` +
            (outcome.requiredPercentage ? ` (needed ${outcome.requiredPercentage}%)` : "") +
            ". Moving to the next round."
        );
        setCurrent((c) => Math.min(questions.length - 1, Math.max(c, index) + 1));
      } catch (err) {
        if (err instanceof ApiError && err.status === 410) {
          push("Time is up — submitting your quiz now.", "warning");
          handleSubmit(true);
        } else {
          push(err instanceof ApiError ? err.message : "Failed to finish this round", "error");
        }
      } finally {
        finishingRound.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quizId, session?.token, questions.length, roundIdAt, handleSubmit, navigate]
  );

  // Rounds are sequential: the palette can only move within the active round,
  // so a student can't skip ahead past a qualification gate.
  const jumpToQuestion = useCallback(
    (index) => {
      const target = roundIdAt(index);
      const active = roundIdAt(current);
      if (target && active && target !== active) {
        push("Finish the current round first.", "warning");
        return;
      }
      setCurrent(index);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, roundIdAt]
  );

  // Moves to the next question after flushing any pending answer for the
  // current one. Used by both Next and Skip so they behave identically.
  const goToNextQuestion = useCallback(async () => {
    if (isRoundBoundary(current) && roundIsGated(roundIdAt(current))) {
      await completeRoundAndContinue(current);
      return;
    }
    setCurrent((c) => Math.min(questions.length - 1, c + 1));
    try {
      await flushPendingCodeRef.current();
    } catch {
      // non-fatal — the answer is retried on the next save/submit
    }
  }, [questions.length, current, isRoundBoundary, roundIsGated, roundIdAt, completeRoundAndContinue]);

  // ---------------------------------------------------------------------
  // Proctoring: every suspicious browser event is reported to the server so it
  // is recorded against this attempt. Tab switches / focus loss count towards
  // the tab-switch limit; softer signals are logged only.
  // ---------------------------------------------------------------------
  const PROCTOR_MESSAGES = useRef({
    fullscreen_exit: "You left fullscreen — ending your attempt.",
    context_menu: "Right-click is disabled during the quiz.",
    blocked_shortcut: "That keyboard shortcut is disabled during the quiz.",
    new_tab_blocked: "Opening another tab, window, or site isn't allowed — ending your attempt.",
    devtools_attempt: "Developer tools aren't allowed during the quiz — ending your attempt.",
    clipboard_copy: "Copying is disabled during the quiz.",
    clipboard_cut: "Copying is disabled during the quiz.",
    clipboard_paste: "Pasting is disabled during the quiz.",
    alt_tab_attempt: "Stay on the quiz window.",
    tab_switch: "Leaving the quiz tab isn't allowed — ending your attempt.",
    window_blur: "Switching to another app isn't allowed — ending your attempt.",
    navigation_attempt: "Leaving the quiz page isn't allowed — ending your attempt.",
    screenshot_attempt: "Screenshots aren't allowed during the quiz — ending your attempt.",
  }).current;

  const lastReportRef = useRef({});
  const reportProctorEvent = useCallback(
    async (reason) => {
      if (submittedRef.current || !session?.token) return;
      // Screen lock/wake and a temporary internet disconnection must never
      // log a student out — while offline, don't even attempt to report
      // (the request would fail anyway, but this also avoids a burst of
      // failed calls once connectivity returns).
      if (offlineRef.current || (typeof navigator !== "undefined" && !navigator.onLine)) return;
      // Throttle noisy events (blur fires repeatedly on some platforms).
      const now = Date.now();
      if (now - (lastReportRef.current[reason] || 0) < 1200) return;
      lastReportRef.current[reason] = now;

      const message = PROCTOR_MESSAGES[reason];
      if (message) setViolationBanner(message);

      try {
        const data = await apiFetch(`/quizzes/${quizId}/violation`, {
          method: "POST",
          token: session.token,
          body: { reason, hard: HARD_VIOLATION_REASONS.has(reason) },
        });
        if (typeof data.violationsCount === "number") setViolationsCount(data.violationsCount);
        if (data.autoSubmitted) {
          submittedRef.current = true;
          clearStudentSession(quizId);
          // Show a clear popup explaining why the attempt was ended instead
          // of silently redirecting — the student's next action is their
          // own choice ("Back to Quizzes"), not an automatic navigation.
          setLogoutInfo({
            message:
              data.logoutMessage ||
              "Suspicious activity outside the quiz was detected too many times, so your attempt was automatically submitted and you were signed out.",
          });
        } else if (data.counted) {
          setViolationBanner(
            data.limitReached
              ? `Warning ${data.violationsCount}/${data.limit}: leaving the quiz again may auto-submit it.`
              : `Leaving the quiz was detected (${data.violationsCount}/${data.limit}). Stay on this page.`
          );
        }
      } catch {
        // best-effort proctoring signal — never block the quiz
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quizId, session?.token]
  );

  const proctorActive = !loading && Boolean(quiz) && !submitting && !logoutInfo;
  const { isFullscreen, fullscreenSupported, enterFullscreen, exitFullscreen, requestWakeLock } = useProctoring({
    active: proctorActive,
    onEvent: reportProctorEvent,
  });

  // Ask again for fullscreen if the student dropped out of it mid-quiz.
  useEffect(() => {
    if (!proctorActive || !fullscreenSupported) return;
    setFullscreenPrompt(!isFullscreen);
  }, [proctorActive, isFullscreen, fullscreenSupported]);

  // Page Visibility API — tab switching / minimising / opening another app.
  // Reported on RETURN (not on leaving) so the duration the tab was hidden
  // is known: a very brief spell (a quick lock-screen unlock, e.g. via
  // fingerprint or PIN) is treated as a non-violation rather than punishing
  // something outside the student's control. Genuinely leaving the quiz —
  // switching tabs, minimising, or opening another app to look something
  // up — takes materially longer and is still counted normally. Nothing is
  // reported at all while the connection is offline (see reportProctorEvent).
  const TAB_HIDDEN_GRACE_MS = 2000;
  const hiddenSinceRef = useRef(null);
  const wasOfflineWhileHiddenRef = useRef(false);
  useEffect(() => {
    if (!proctorActive) return undefined;
    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
        wasOfflineWhileHiddenRef.current = typeof navigator !== "undefined" && !navigator.onLine;
        return;
      }
      const since = hiddenSinceRef.current;
      const wasOffline = wasOfflineWhileHiddenRef.current;
      hiddenSinceRef.current = null;
      wasOfflineWhileHiddenRef.current = false;
      if (wasOffline) return; // connectivity drop, not a proctoring event
      if (since && Date.now() - since < TAB_HIDDEN_GRACE_MS) return; // brief flicker
      reportProctorEvent("tab_switch");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [proctorActive, reportProctorEvent]);

  // Leave fullscreen once the attempt is finished.
  useEffect(() => {
    return () => {
      exitFullscreen();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!instructionsDone) {
    return (
      <QuizInstructions
        quizTitle={session?.quizTitle || ""}
        onStart={() => {
          // Must be triggered by this user gesture — browsers reject
          // programmatic fullscreen / wake-lock requests made any other way.
          enterFullscreen();
          requestWakeLock();
          try {
            sessionStorage.setItem(instructionsKey, "1");
          } catch {
            // storage unavailable — continue anyway
          }
          setInstructionsDone(true);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-10">
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (!quiz || questions.length === 0) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center text-sm text-ink-500">
        This quiz has no questions available right now.
      </div>
    );
  }

  const q = questions[current];
  const currentLimit = questionLimitSeconds(q);
  const questionLocked = currentLimit ? expiredQuestionIds.has(q.id) : false;
  // A forced proctoring logout sends the student back to whichever listing
  // page they actually came from — Demo Quiz for a "landing" placement
  // quiz, Quizzes otherwise. Pre-migration databases (no `placement`
  // column) fall back to "quizzes", same as everywhere else this field is
  // read.
  const backToListPath = quiz?.placement === "landing" ? "/demo-quiz" : "/quizzes";

  return (
    <div className="min-h-screen">
      <div ref={quizHeaderRef} className="sticky top-0 z-30 border-b hairline bg-void/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-100">{quiz.title}</p>
            <p className="text-xs text-ink-500">
              {currentLevel && levelGroups.length > 1 ? (
                <>
                  <span className="text-ink-300">{currentLevel.label}</span>
                  {" · "}
                  Question {currentLevelPosition} of {currentLevel.indices.length}
                </>
              ) : (
                <>
                  Question {current + 1} of {questions.length}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {currentLimit && (
              <div className="hidden sm:block">
                <QuestionTimer
                  secondsLeft={questionSecondsLeft}
                  totalSeconds={currentLimit}
                  expired={questionLocked}
                />
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Timer totalSeconds={remainingSeconds} onExpire={() => handleSubmit(true)} paused={connectionLost} />
              {connectionLost && (
                <span className="rounded-full border border-ink-500/30 bg-ink-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-ink-300">
                  Paused
                </span>
              )}
            </div>
            <button
              type="button"
              title="Log out and resume later"
              onClick={() => setConfirmLogout(true)}
              className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-white/5 hover:text-ink-100"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Blocks all interaction with the quiz (questions, palette, submit)
          while the student is out of fullscreen — as close to "prevent
          exiting" as a browser will allow, since no web API can stop the
          Escape key or OS controls from leaving fullscreen in the first
          place. The header (title + both timers) stays visible above this
          overlay so it's clear time keeps running while it's up. */}
      {fullscreenPrompt && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 flex flex-col items-center justify-center gap-4 bg-void/95 px-5 text-center backdrop-blur-md"
          style={{ top: quizHeaderHeight }}
          role="alertdialog"
          aria-modal="true"
          aria-label="Fullscreen required to continue the quiz"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber/10">
            <Maximize className="h-8 w-8 text-amber" />
          </div>
          <div>
            <p className="text-lg font-semibold text-ink-100">Secure mode is off</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-500">
              Leaving fullscreen ends your attempt — it's already being reported. If you're
              back before that finishes (e.g. your connection was briefly offline), you can
              still return to fullscreen to keep answering.
            </p>
          </div>
          <Button size="lg" onClick={() => enterFullscreen()}>
            <Maximize className="h-4 w-4" /> Enter fullscreen
          </Button>
        </div>
      )}

      {/* Network Quality Protection — blocks interaction (same pattern as the
          fullscreen-required overlay above, and stacked on top of it, since
          reconnecting takes priority) while the connection is confirmed
          lost. The header — including the now-paused timer — stays visible
          above it. Every answer the student had entered is already saved
          (server-side as it was typed, and locally as a backup), and
          `current` is never touched while this is up, so the quiz resumes
          on exactly the same question the instant the connection returns. */}
      {connectionLost && (
        <div
          className="fixed inset-x-0 bottom-0 z-[45] flex flex-col items-center justify-center gap-4 bg-void/95 px-5 text-center backdrop-blur-md"
          style={{ top: quizHeaderHeight }}
          role="alertdialog"
          aria-modal="true"
          aria-label="Connection lost — reconnecting"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink-500/10">
            <Loader2 className="h-8 w-8 animate-spin text-ink-300" />
          </div>
          <div>
            <p className="text-lg font-semibold text-ink-100">Connection Lost – Reconnecting…</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-500">
              Your timer is paused and every answer is saved. You'll pick up on this exact
              question the moment you're back online — this is never treated as a security
              violation, so there's no need to refresh or do anything else.
            </p>
          </div>
        </div>
      )}

      {!isOnline && !connectionLost && (
        <div className="mx-auto mt-4 flex max-w-5xl items-center gap-2 rounded-xl border border-ink-500/30 bg-ink-500/10 px-4 py-3 text-sm text-ink-300">
          <AlertTriangle className="h-4 w-4 shrink-0" /> You're offline. Your answers are saved
          locally and will sync once your connection is back — this is never treated as a
          security violation.
        </div>
      )}

      {violationBanner && (
        <div className="mx-auto mt-4 flex max-w-5xl items-center gap-2 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {violationBanner}
        </div>
      )}

      {roundBanner && (
        <div className="mx-auto mt-4 flex max-w-5xl items-start gap-2 rounded-xl border border-mint/30 bg-mint/10 px-4 py-3 text-sm text-mint">
          <span className="flex-1">{roundBanner}</span>
          <button type="button" onClick={() => setRoundBanner(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 px-5 py-6 lg:grid-cols-[1fr_260px]">
        <div className="glass-card p-6">
          {currentLimit && (
            <div className="mb-4 sm:hidden">
              <QuestionTimer
                secondsLeft={questionSecondsLeft}
                totalSeconds={currentLimit}
                expired={questionLocked}
              />
            </div>
          )}
          {questionLocked && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
              <AlertTriangle className="h-4 w-4 shrink-0" /> The time limit for this question is over — it can no longer
              be answered.
            </div>
          )}
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            {q.marks} mark{q.marks === 1 ? "" : "s"}
            {q.negativeMarks > 0 ? ` • -${q.negativeMarks} if wrong` : ""}
            {q.type === "coding" ? ` • ${LANGUAGE_LABELS[q.language] || q.language}` : ""}
          </p>
          <h2 className="mt-2 text-lg text-ink-100 whitespace-pre-wrap">{q.text}</h2>

          {q.type === "coding" ? (
            <CodingWorkspace
              question={q}
              quizId={quizId}
              token={session.token}
              value={selections[q.id] ?? q.starterCode ?? ""}
              onChange={(next) => updateCode(q.id, next)}
              disabled={questionLocked}
              push={push}
              onSubmitted={(code) => setSelections((sel) => ({ ...sel, [q.id]: code }))}
              fullscreenTopOffset={quizHeaderHeight}
            />
          ) : q.type === "fill_blank" ? (
            <div className="mt-5 space-y-3">
              {Array.from({ length: q.blanksCount || 1 }).map((_, idx) => (
                <input
                  key={idx}
                  value={(selections[q.id] || [])[idx] ?? ""}
                  onChange={(e) => updateBlank(q.id, idx, e.target.value, q.blanksCount || 1)}
                  disabled={questionLocked}
                  placeholder={(q.blanksCount || 1) > 1 ? `Blank ${idx + 1}` : "Your answer"}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-ink-100 outline-none focus:border-electric/40"
                />
              ))}
              <p className="text-[11px] text-ink-700">
                Your answer is saved automatically as you type.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-2.5">
              {q.options.map((opt) => {
                const selected = selections[q.id] === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => selectOption(q.id, opt.id)}
                    disabled={questionLocked}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all duration-150 ${
                      questionLocked ? "cursor-not-allowed opacity-60" : ""
                    } ${
                      selected
                        ? "border-electric/50 bg-electric/10 text-ink-100"
                        : "border-white/10 bg-white/[0.02] text-ink-300 hover:border-white/20 hover:bg-white/[0.04]"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        selected ? "border-electric bg-electric" : "border-white/20"
                      }`}
                    >
                      {selected && <span className="h-1.5 w-1.5 rounded-full bg-void" />}
                    </span>
                    {opt.text}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <Button
              variant="secondary"
              size="sm"
              icon={ChevronLeft}
              disabled={current === 0}
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
            >
              Previous
            </Button>
            {current === questions.length - 1 ? (
              <Button size="sm" icon={Send} onClick={() => setConfirmSubmit(true)} disabled={submitting}>
                Submit quiz
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                {/* Skip behaves exactly like Next: it saves the current answer
                    state and immediately moves to the next question. */}
                <Button variant="secondary" size="sm" icon={SkipForward} onClick={goToNextQuestion}>
                  Skip
                </Button>
                <Button size="sm" onClick={goToNextQuestion}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <QuestionPalette
            questions={questions}
            current={current}
            answered={answeredIds}
            onJump={jumpToQuestion}
            groups={levelGroups}
          />
          <Button variant="secondary" className="w-full" icon={Send} onClick={() => setConfirmSubmit(true)} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit quiz"}
          </Button>
          {violationsCount > 0 && (
            <p className="text-center text-xs text-amber">
              Tab-switch violations: {violationsCount}/{tabSwitchLimit}
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit your quiz?"
        description={`You've answered ${answeredIds.size} of ${questions.length} questions. This cannot be undone.`}
        confirmLabel="Submit"
        onConfirm={() => {
          setConfirmSubmit(false);
          handleSubmit();
        }}
        onCancel={() => setConfirmSubmit(false)}
      />

      <ConfirmDialog
        open={confirmLogout}
        title="Log out for now?"
        description="Your quiz is NOT submitted — every saved answer, your timer and your current question are kept exactly as they are. Log back in with the same Register Number to resume right where you left off."
        confirmLabel={loggingOut ? "Logging out..." : "Log out"}
        cancelLabel="Stay in quiz"
        tone="default"
        onConfirm={handleLogoutSession}
        onCancel={() => setConfirmLogout(false)}
      />

      {/* Large, unmissable popup shown when a proctoring violation force-ends
          the attempt (e.g. too many tab switches / window switches — an
          activity outside the quiz tab itself). Replaces the old silent
          redirect to the result page so the reason is always explained. */}
      <Modal
        open={Boolean(logoutInfo)}
        onClose={() => navigate(backToListPath, { replace: true })}
        title="You've been logged out"
        maxWidth="max-w-lg"
      >
        <div className="flex flex-col items-center gap-5 px-2 py-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-coral/10">
            <LogOut className="h-8 w-8 text-coral" />
          </div>
          <div>
            <p className="text-lg font-semibold text-ink-100">Your quiz attempt was ended</p>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">{logoutInfo?.message}</p>
          </div>
          <Button size="lg" className="w-full" onClick={() => navigate(backToListPath, { replace: true })}>
            Back to Quizzes
          </Button>
        </div>
      </Modal>
    </div>
  );
}
