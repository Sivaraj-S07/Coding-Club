import { apiFetch } from "./api";

/** Typed-ish wrappers around /api/ai/*. Every call needs a student account token. */
export function aiApi(token) {
  const opts = (extra = {}) => ({ token, ...extra });
  return {
    status: () => apiFetch("/ai/status"),
    profile: () => apiFetch("/ai/profile", opts()),
    saveProfile: (body) => apiFetch("/ai/profile", opts({ method: "PUT", body })),
    curriculum: () => apiFetch("/ai/curriculum", opts()),
    recommendations: () => apiFetch("/ai/recommendations", opts()),
    sessions: () => apiFetch("/ai/adaptive", opts()),
    startPractice: (body) => apiFetch("/ai/adaptive/start", opts({ method: "POST", body })),
    getSession: (id) => apiFetch(`/ai/adaptive/${id}`, opts()),
    answer: (id, body) => apiFetch(`/ai/adaptive/${id}/answer`, opts({ method: "POST", body })),
    tutor: (body, signal) => apiFetch("/ai/tutor", opts({ method: "POST", body, signal })),
    simplify: (body) => apiFetch("/ai/simplify", opts({ method: "POST", body })),
  };
}
