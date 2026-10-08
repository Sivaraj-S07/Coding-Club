// Strong-password policy for student self-service accounts (Sign Up).
// Kept as a single source of truth so the rule can never drift between the
// route that enforces it and any message shown about it.
//
// Requirements: at least 8 characters, with at least one lowercase letter,
// one uppercase letter, one digit, and one special character.
const MIN_LENGTH = 8;
const RULES = [
  { test: (v) => v.length >= MIN_LENGTH, message: `at least ${MIN_LENGTH} characters` },
  { test: (v) => /[a-z]/.test(v), message: "one lowercase letter" },
  { test: (v) => /[A-Z]/.test(v), message: "one uppercase letter" },
  { test: (v) => /[0-9]/.test(v), message: "one number" },
  { test: (v) => /[^A-Za-z0-9]/.test(v), message: "one special character" },
];

/** Returns an array of human-readable unmet requirements (empty = strong enough). */
function passwordIssues(password) {
  const value = String(password ?? "");
  return RULES.filter((rule) => !rule.test(value)).map((rule) => rule.message);
}

function isStrongPassword(password) {
  return passwordIssues(password).length === 0;
}

module.exports = { passwordIssues, isStrongPassword, MIN_LENGTH };
