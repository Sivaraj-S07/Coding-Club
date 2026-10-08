// Allowed registration values. Kept in sync with frontend/src/lib/options.js.
// Validation happens here too so the rules cannot be bypassed via the API.

const DEPARTMENTS = ["CSE", "IT", "ECE", "EEE", "CSBS", "AIDS", "MECH"];
const YEARS = ["First Year", "Second Year", "Third Year", "Final Year"];
const SECTIONS = ["A", "B", "C", "D"];

// Batch = admission year -> graduation year, e.g. "2024-2028". Both the
// start year and the end year are freely, independently selectable on the
// frontend (a "Course Duration" is simply displayed as end - start, never
// picked separately) — so server-side this only re-validates the *shape and
// arithmetic* (start/end are 4-digit years, the span is a sane length of
// study, and the start year isn't absurdly far from now). It deliberately
// doesn't hardcode a specific list of spans, since "now" keeps moving and a
// batch's length shouldn't be limited to a fixed preset.
const MIN_BATCH_SPAN_YEARS = 1;
const MAX_BATCH_SPAN_YEARS = 8;
// The year-calendar picker on Sign Up always shows at least this many years
// beyond the current one (plus it keeps pace automatically every year since
// it's computed from `new Date()`, never hardcoded to a specific year).
const FUTURE_YEARS_AHEAD = 5;

// Case/spacing tolerant match that returns the canonical value, or null.
function normalizeFrom(list, value) {
  const needle = String(value ?? "").trim().toLowerCase();
  if (!needle) return null;
  return list.find((item) => item.toLowerCase() === needle) || null;
}

const BATCH_RE = /^(\d{4})-(\d{4})$/;
function isValidBatch(value) {
  const match = BATCH_RE.exec(String(value ?? "").trim());
  if (!match) return false;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const span = end - start;
  if (span < MIN_BATCH_SPAN_YEARS || span > MAX_BATCH_SPAN_YEARS) return false;
  const currentYear = new Date().getFullYear();
  // Generous window: several years in the future (freshly-announced
  // admissions, picked from the year calendar selector) to a couple of
  // decades in the past (alumni updating their profile long after
  // graduating). Keep FUTURE_YEARS_AHEAD in sync with
  // frontend/src/lib/options.js so the calendar picker's range is always
  // accepted by the server.
  return start >= currentYear - 20 && start <= currentYear + FUTURE_YEARS_AHEAD;
}

// Email: standard-shape check (defense-in-depth; the real uniqueness check
// happens in the DB via a partial unique index on lower(email)). Kept
// deliberately simple/RFC-loose — we're validating "did you typo your
// email", not attempting full RFC 5322 compliance.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizeEmail(value) {
  const trimmed = String(value ?? "").trim().toLowerCase();
  return EMAIL_RE.test(trimmed) ? trimmed : null;
}

module.exports = {
  DEPARTMENTS,
  YEARS,
  SECTIONS,
  MIN_BATCH_SPAN_YEARS,
  MAX_BATCH_SPAN_YEARS,
  FUTURE_YEARS_AHEAD,
  normalizeDepartment: (v) => normalizeFrom(DEPARTMENTS, v),
  normalizeYear: (v) => normalizeFrom(YEARS, v),
  normalizeSection: (v) => normalizeFrom(SECTIONS, v),
  isValidBatch,
  // Mobile numbers: exactly 10 digits, nothing more, nothing less.
  MOBILE_NUMBER_LENGTH: 10,
  normalizeMobileNumber: (v) => {
    const digits = String(v ?? "").replace(/[^0-9]/g, "");
    return /^[0-9]{10}$/.test(digits) ? digits : null;
  },
  EMAIL_RE,
  normalizeEmail,
};
