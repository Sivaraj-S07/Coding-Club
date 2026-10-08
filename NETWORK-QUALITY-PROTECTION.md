# Network Quality Protection

Additive feature — no existing feature, endpoint, or security check was
changed or removed. All changes are frontend-only.

## What it does

**Before a quiz starts** (`QuizInstructions.jsx`)
- Runs a quick, one-round-trip connection check (a ping to the existing
  `/api/health` endpoint, with a single fast retry on failure) silently in
  the background while the student reads the instructions.
- This check **never adds a wait by itself**. Students can finish the
  slides/countdown and click "Start Quiz" the moment those existing gates
  are satisfied — the network check does not need to have finished, and a
  slow-but-working connection is never a reason to block. The only thing
  it can do is disable "Start Quiz" when it actually finds a **critical**
  problem — the server is genuinely unreachable (e.g. the device is
  offline) — since starting in that state would just fail anyway.
- No UI is shown for a normal/healthy connection. A status pill and a
  short explanation ("We couldn't reach the server…") only appear when a
  critical failure is detected, with a manual "Retry connection check"
  option. While critical, the check also quietly re-runs itself every few
  seconds so the gate lifts on its own as soon as the connection returns —
  the student doesn't have to notice and click retry.

**During the quiz** (`QuizRunner.jsx`)
- A live connection monitor (browser online/offline events + a periodic
  health-ping heartbeat, so it also catches "Wi-Fi connected but the server
  is unreachable") detects when the connection drops.
- On drop:
  - The visible timers (overall quiz timer + per-question timer) **pause**
    — they stop ticking down instead of counting through time the student
    can't act on.
  - A full-screen **"Connection Lost – Reconnecting…"** overlay appears,
    blocking interaction with the quiz (same pattern already used for the
    "exit fullscreen" overlay).
  - Any answer that fails to save due to the network error is queued
    locally (in memory + `localStorage`) instead of being silently lost.
    A continuous local backup of all current answers is also kept as a
    safety net.
- On reconnect (confirmed by a real ping, not just the browser's `online`
  event):
  - The overlay closes and the timers resume.
  - Queued answers are automatically retried and saved.
  - Remaining time / per-question deadlines / violation count are
    re-synced from the server using the same idempotent `start` endpoint
    the page already calls on load.
  - The student's current question is **never changed** by any of this —
    it simply never moved while disconnected, so the quiz resumes exactly
    where it left off.

## What was intentionally left unchanged

- All proctoring / security logic (tab-switch detection, fullscreen
  enforcement, devtools/screenshot detection, violation reporting and
  auto-submit thresholds) — untouched, byte-for-byte.
- The server remains the sole authority on both the overall quiz deadline
  and every per-question deadline. Nothing in this feature can grant extra
  accepted time — pausing only affects what's *displayed* on the student's
  screen. Answers/questions are still rejected server-side once the real
  deadline has passed, exactly as before.
- No backend code, routes, or database schema were touched.

## Files changed / added

- `frontend/src/hooks/useNetworkQuality.js` — pre-quiz stability check +
  live connection monitor.
- `frontend/src/components/QuizInstructions.jsx` — pre-quiz network gate
  added to the existing Start Quiz conditions.
- `frontend/src/components/Timer.jsx` — added an optional `paused` prop
  (defaults to `false`, fully backward compatible) and a resync-from-prop
  effect.
- `frontend/src/pages/student/QuizRunner.jsx` — wires the live monitor in,
  pauses both timers, shows the reconnect overlay, and adds the local
  answer queue + reconnect resync.

## Optimization pass (this update)

The original pre-quiz check ran 3 sequential pings, each with a 4s
timeout, and required **all three** to succeed before "Start Quiz" would
even unlock — worst case, over 12 seconds of possible waiting, and any
single blip among the three reset the gate. That made the check itself a
source of delay and false blocks, working against the point of the
feature. Changed to:

- `useNetworkStabilityCheck` now does one quick ping (2.5s timeout) with
  one fast retry (2s timeout) on failure, and reports a simple
  `"ok" | "critical" | "unknown"` status instead of "stable: true only if
  every attempt passed". A browser-reported offline state short-circuits
  straight to `"critical"` with no network round-trip at all.
- `QuizInstructions` only blocks "Start Quiz" on `"critical"` — a
  `"checking"` or merely-`"unknown"` state never blocks, so students are
  never stuck waiting on the check itself.
- The status pill and explanatory text are shown only when there's an
  actual critical problem — no UI noise for the normal, healthy case.
- While critical, the check auto-retries every 5s in the background in
  addition to the manual retry button.

Nothing about proctoring, the live in-quiz reconnect monitor, timer
pausing, the answer queue, or any backend code changed — this pass only
touches the pre-start check described above.

## Verification performed

- `npm run build` — succeeds, zero errors.
- `npx oxlint src` — 0 errors across the whole frontend (only pre-existing
  style warnings that already existed in untouched files such as
  `useProctoring.js`, in the same categories).
- `node --check` on every backend source file — all pass (backend was not
  modified, verified unchanged and still syntactically valid).
