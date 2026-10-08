/**
 * Provider-agnostic LLM client with automatic offline fallback.
 *
 *   AI_PROVIDER=auto (default) | anthropic | gemini | local
 *
 *   - anthropic: ANTHROPIC_API_KEY (+ optional ANTHROPIC_MODEL)
 *   - gemini   : GEMINI_API_KEY    (+ optional GEMINI_MODEL) — the same key the
 *                project's .env already reserves for Gemini
 *   - local    : never call a network model; use the built-in tutor only
 *
 * `auto` picks Anthropic when its key exists, otherwise Gemini, otherwise local.
 * Every caller must handle AiUnavailableError by falling back to localTutor —
 * nothing in the platform depends on an external AI being reachable.
 */
const env = require("../config/env");

class AiUnavailableError extends Error {
  constructor(message, { retryable = true } = {}) {
    super(message);
    this.name = "AiUnavailableError";
    this.retryable = retryable;
  }
}

const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 25000;
const COOLDOWN_MS = 60 * 1000;
let cooldownUntil = 0;

function configured() {
  const preference = String(env.AI_PROVIDER || "auto").toLowerCase();
  if (preference === "local" || preference === "off") return "local";
  if (preference === "anthropic") return env.ANTHROPIC_API_KEY ? "anthropic" : "local";
  if (preference === "gemini") return env.GEMINI_API_KEY ? "gemini" : "local";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.GEMINI_API_KEY) return "gemini";
  return "local";
}

function status() {
  const provider = configured();
  return {
    provider,
    aiEnabled: provider !== "local" && Date.now() >= cooldownUntil,
    model: provider === "anthropic" ? env.ANTHROPIC_MODEL : provider === "gemini" ? env.GEMINI_MODEL : null,
    degraded: provider !== "local" && Date.now() < cooldownUntil,
  };
}

async function fetchJson(url, init) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  init.signal?.addEventListener("abort", onAbort, { once: true });
  if (init.signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: response.ok, status: response.status, data, text };
  } catch (err) {
    if (init.signal?.aborted) throw Object.assign(new Error("Stopped by the student"), { name: "AbortError" });
    if (err && err.name === "AbortError") throw new AiUnavailableError("AI request timed out");
    throw new AiUnavailableError(`AI network error: ${err && err.message ? err.message : err}`);
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", onAbort);
  }
}

async function callAnthropic({ system, messages, maxTokens, temperature, signal }) {
  const { ok, status: code, data, text } = await fetchJson("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      temperature,
      system,
      messages,
    }),
  });
  if (!ok) {
    throw new AiUnavailableError(`Anthropic error ${code}: ${(data && data.error && data.error.message) || text.slice(0, 160)}`, {
      retryable: code === 429 || code >= 500,
    });
  }
  const out = (data && Array.isArray(data.content) ? data.content : []).filter((b) => b.type === "text").map((b) => b.text).join("");
  if (!out.trim()) throw new AiUnavailableError("Anthropic returned an empty reply");
  return { text: out, model: env.ANTHROPIC_MODEL };
}

async function callGeminiOnce(model, { system, messages, maxTokens, temperature, json, signal }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  return fetchJson(url, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: {
        temperature,
        maxOutputTokens: Math.max(maxTokens, 1024),
        ...(json ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
}

async function callGemini(opts) {
  // The configured model name is user-supplied (GEMINI_MODEL). If it does not
  // exist for this key, retry once with a widely available model instead of
  // failing every request.
  const candidates = [env.GEMINI_MODEL, "gemini-2.5-flash"].filter((m, i, a) => m && a.indexOf(m) === i);
  let last = null;
  for (const model of candidates) {
    const result = await callGeminiOnce(model, opts);
    if (result.ok) {
      const parts = result.data?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p) => p.text || "").join("");
      if (!text.trim()) throw new AiUnavailableError("Gemini returned an empty reply");
      return { text, model };
    }
    last = result;
    if (result.status !== 404 && result.status !== 400) break; // only model-name problems are worth a retry
  }
  throw new AiUnavailableError(
    `Gemini error ${last.status}: ${(last.data && last.data.error && last.data.error.message) || last.text.slice(0, 160)}`,
    { retryable: last.status === 429 || last.status >= 500 }
  );
}

/**
 * @param {object} opts
 * @param {string} opts.system
 * @param {{role:"user"|"assistant", content:string}[]} opts.messages
 * @param {boolean} [opts.json]
 */
async function generate({ system, messages, json = false, maxTokens = 900, temperature = 0.4, signal }) {
  if (signal?.aborted) throw Object.assign(new Error("Stopped by the student"), { name: "AbortError" });
  const provider = configured();
  if (provider === "local") throw new AiUnavailableError("No AI provider configured", { retryable: false });
  if (Date.now() < cooldownUntil) throw new AiUnavailableError("AI provider is cooling down after a failure");
  try {
    const opts = { system, messages, json, maxTokens, temperature, signal };
    const out = provider === "anthropic" ? await callAnthropic(opts) : await callGemini(opts);
    return { ...out, provider };
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      // Back off after an outage/quota error so users aren't made to wait on a
      // dead provider for every single request.
      if (err.retryable) cooldownUntil = Date.now() + COOLDOWN_MS;
      console.warn("[ai]", err.message);
    }
    throw err;
  }
}

/** Pulls the first JSON object out of a model reply (tolerates code fences / chatter). */
function parseJsonReply(text) {
  const cleaned = String(text || "").replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function resetCooldownForTests() {
  cooldownUntil = 0;
}

module.exports = { generate, status, configured, parseJsonReply, AiUnavailableError, resetCooldownForTests };
