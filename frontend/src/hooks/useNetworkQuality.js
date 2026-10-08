import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "../lib/api";

// Reuses the backend's existing lightweight health endpoint — no new
// backend surface is needed for this feature. A handful of small requests
// like this stay well inside the general API rate limit.
const HEALTH_PATH = "/health";
const PING_TIMEOUT_MS = 4000;
// Used by the pre-quiz stability check only — kept short so a slow/blipping
// connection never makes a student sit and wait before they can start.
const QUICK_PING_TIMEOUT_MS = 2500;
const QUICK_RETRY_TIMEOUT_MS = 2000;
const QUICK_RETRY_DELAY_MS = 600;
const HEARTBEAT_MS = 6000;
// A single missed heartbeat can just be a slow response; only treat the
// connection as actually lost after a couple of misses in a row so a brief
// blip doesn't pause the timer or show the reconnect overlay unnecessarily.
const MISSES_BEFORE_LOST = 2;

async function pingHealth(timeoutMs = PING_TIMEOUT_MS) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, latencyMs: null };
  }
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const startedAt = Date.now();
  try {
    const res = await fetch(`${API_URL}${HEALTH_PATH}`, {
      method: "GET",
      cache: "no-store",
      signal: controller?.signal,
    });
    return { ok: res.ok, latencyMs: Date.now() - startedAt };
  } catch {
    return { ok: false, latencyMs: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Quick, non-blocking check used before a quiz starts. Reports whether the
 * server is actually reachable — used only to catch a *critical* failure
 * (no connection at all), never to hold a student back over an ordinary
 * fluctuating connection. The caller should let students in immediately
 * unless this comes back "critical"; it purposely does not grade or gate on
 * latency/jitter, since that's not something a student can fix by waiting.
 *
 * Design goal: resolve in one fast round-trip on the (overwhelmingly
 * common) case that the connection is fine, and never take longer than a
 * couple of seconds even in the worst case, so the check is never the
 * reason a student is stuck outside the quiz.
 */
export function useNetworkStabilityCheck() {
  const [state, setState] = useState({
    checking: false,
    // "unknown" = not checked yet / still checking (never blocks by itself)
    // "ok"       = server reachable
    // "critical" = server unreachable — the only status worth blocking on
    status: "unknown",
    latencyMs: null,
    checkedAt: null,
  });
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const runCheck = useCallback(async () => {
    setState((s) => ({ ...s, checking: true }));

    // The browser already knows it's offline — no point round-tripping to
    // confirm what can't possibly succeed. Report critical immediately.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (mountedRef.current) {
        setState({ checking: false, status: "critical", latencyMs: null, checkedAt: Date.now() });
      }
      return "critical";
    }

    let result = await pingHealth(QUICK_PING_TIMEOUT_MS);
    if (!result.ok) {
      // One retry only, after a short pause — enough to ride out a single
      // dropped packet or slow DNS lookup without treating a passing blip
      // as a real outage, but still fast overall.
      await new Promise((resolve) => setTimeout(resolve, QUICK_RETRY_DELAY_MS));
      result = await pingHealth(QUICK_RETRY_TIMEOUT_MS);
    }

    const status = result.ok ? "ok" : "critical";
    if (mountedRef.current) {
      setState({ checking: false, status, latencyMs: result.latencyMs, checkedAt: Date.now() });
    }
    return status;
  }, []);

  return { ...state, runCheck };
}

/**
 * Live connectivity monitor for an in-progress quiz attempt. Combines the
 * browser's online/offline events with a periodic health ping, so a device
 * that's technically "online" (Wi-Fi connected) but can't actually reach
 * the server is still treated as disconnected. `onLost`/`onRestored` fire
 * only on actual state transitions.
 */
export function useLiveConnectionMonitor({ enabled, onLost, onRestored } = {}) {
  const [connected, setConnected] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const connectedRef = useRef(connected);
  const onLostRef = useRef(onLost);
  const onRestoredRef = useRef(onRestored);
  onLostRef.current = onLost;
  onRestoredRef.current = onRestored;

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let misses = 0;

    const markLost = () => {
      if (cancelled || !connectedRef.current) return;
      connectedRef.current = false;
      setConnected(false);
      onLostRef.current?.();
    };
    const markRestored = () => {
      misses = 0;
      if (cancelled || connectedRef.current) return;
      connectedRef.current = true;
      setConnected(true);
      onRestoredRef.current?.();
    };

    const onOffline = () => {
      misses = MISSES_BEFORE_LOST;
      markLost();
    };
    const onOnline = async () => {
      // Don't trust the browser's "online" event alone — confirm the
      // server is actually reachable before clearing the reconnect state.
      const result = await pingHealth();
      if (result.ok) markRestored();
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    if (typeof navigator !== "undefined" && !navigator.onLine) markLost();

    const heartbeat = setInterval(async () => {
      const result = await pingHealth();
      if (cancelled) return;
      if (result.ok) {
        markRestored();
      } else {
        misses += 1;
        if (misses >= MISSES_BEFORE_LOST) markLost();
      }
    }, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      clearInterval(heartbeat);
    };
  }, [enabled]);

  return connected;
}
