/**
 * Ties an AbortSignal to an HTTP request's lifecycle so a long-running code
 * execution can be cancelled the moment the client goes away — the student
 * closed the tab, the console's Clear button aborted the in-flight fetch, or
 * the connection simply dropped. Without this, "Clear" on the frontend only
 * stops the browser from waiting; the compiled program kept running on the
 * server until its own timeout expired, which is exactly the "leftover
 * background process" behavior this fixes.
 *
 * Usage:
 *   const { signal, cleanup } = abortSignalForRequest(req, res);
 *   try {
 *     const run = await executeCode({ ..., signal });
 *   } finally {
 *     cleanup();
 *   }
 *
 * Listens on the *response*, not the request: `res`'s "close" event fires
 * both on a normal completed response and on an early client disconnect, so
 * a single handler covers both — by the time it fires after a normal
 * response, the execution promise has already settled and abort() is a
 * harmless no-op.
 */
function abortSignalForRequest(req, res) {
  const controller = new AbortController();
  const onClose = () => controller.abort();
  const target = typeof res?.on === "function" ? res : req;
  target?.on?.("close", onClose);
  return {
    signal: controller.signal,
    cleanup() {
      target?.removeListener?.("close", onClose);
    },
  };
}

module.exports = { abortSignalForRequest };
