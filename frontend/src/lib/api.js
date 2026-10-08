const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Thin fetch wrapper for the backend REST API.
 * @param {string} path - e.g. "/admin/quizzes"
 * @param {object} options
 * @param {"GET"|"POST"|"PUT"|"PATCH"|"DELETE"} [options.method]
 * @param {object} [options.body]
 * @param {string} [options.token] - Bearer token (admin or student)
 * @param {boolean} [options.raw] - if true, return the raw Response (e.g. for CSV downloads)
 */
// Identical GETs fired in the same tick (React StrictMode double-effects,
// several widgets asking for the same resource) share one network round-trip.
const inFlightGets = new Map();

export async function apiFetch(path, options = {}) {
  const { method = "GET", token, raw = false, signal, headers } = options;

  if (method === "GET" && !raw && !signal && !headers) {
    const key = `${path}|${token || ""}`;
    const pending = inFlightGets.get(key);
    if (pending) return pending;
    const request = performFetch(path, options).finally(() => inFlightGets.delete(key));
    inFlightGets.set(key, request);
    return request;
  }
  return performFetch(path, options);
}

async function performFetch(path, options = {}) {
  const { method = "GET", body, token, raw = false, headers: extraHeaders, signal } = options;

  const headers = { ...(extraHeaders || {}) };
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      signal,
    });
  } catch (networkErr) {
    // An aborted fetch (e.g. the console's Clear button cancelling an
    // in-flight run) throws a DOMException named "AbortError" — let that
    // propagate as-is instead of masking it as a generic network failure, so
    // callers can tell "the student cancelled" apart from "the server is
    // unreachable" and skip showing an error for the former.
    if (networkErr && networkErr.name === "AbortError") throw networkErr;
    throw new ApiError(
      "Could not reach the server. Check that the backend is running and VITE_API_URL is correct.",
      0
    );
  }

  if (raw) return response;

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json().catch(() => ({})) : null;

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Request failed with status ${response.status}`,
      response.status,
      data?.details
    );
  }

  return data;
}

export { API_URL };
