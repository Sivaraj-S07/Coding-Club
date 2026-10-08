// Single source of truth for the student registration dropdowns.
// The backend validates against the exact same lists (backend/src/utils/enums.js)
// so arbitrary values can never be submitted through the API.

export const DEPARTMENTS = ["CSE", "IT", "ECE", "EEE", "CSBS", "AIDS", "MECH"];

export const YEARS = ["First Year", "Second Year", "Third Year", "Final Year"];

export const SECTIONS = ["A", "B", "C", "D"];

// Batch = admission year → graduation year, e.g. "2024-2028". Start year and
// end year are each freely, independently selectable — there's no fixed
// "3/4/5 years" preset driving them. "Course Duration" (end - start) is
// simply computed and displayed once both are picked, never chosen on its
// own. Keep these in sync with backend/src/utils/enums.js.
export const MIN_BATCH_SPAN_YEARS = 1;
export const MAX_BATCH_SPAN_YEARS = 8;

// Keep in sync with backend/src/utils/enums.js (FUTURE_YEARS_AHEAD) — the
// server re-validates the batch start year against the exact same window.
// The year-calendar picker always shows this many years beyond "now" (which
// itself moves forward every year, so the extra future years are dynamic,
// not a fixed hardcoded list of years).
export const FUTURE_YEARS_AHEAD = 5;
export const PAST_YEARS_BACK = 20;

// Plausible admission/start years — never free text. Several years ahead for
// newly-announced admissions, two decades back for alumni/returning students
// updating their profile long after graduating. Computed fresh from the
// current date every time, so the range quietly keeps pace with real time.
export function getStartYearOptions({ yearsAhead = FUTURE_YEARS_AHEAD, yearsBack = PAST_YEARS_BACK } = {}) {
  const now = new Date().getFullYear();
  const options = [];
  for (let year = now + yearsAhead; year >= now - yearsBack; year--) {
    options.push(String(year));
  }
  return options;
}

// Given a chosen start year, the plausible graduation years — capped to a
// sane course length so the dropdown stays short and the arithmetic still
// passes backend validation.
export function getEndYearOptions(startYear, { maxSpanYears = MAX_BATCH_SPAN_YEARS } = {}) {
  const start = Number(startYear);
  if (!start) return [];
  const options = [];
  for (let year = start + MIN_BATCH_SPAN_YEARS; year <= start + maxSpanYears; year++) {
    options.push(String(year));
  }
  return options;
}
