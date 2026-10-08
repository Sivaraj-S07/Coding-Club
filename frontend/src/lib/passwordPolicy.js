// Mirrors backend/src/utils/passwordPolicy.js so Sign Up can show live
// feedback without a round-trip; the backend re-validates independently.
export const PASSWORD_RULES = [
  { key: "length", label: "At least 8 characters", test: (v) => v.length >= 8 },
  { key: "lower", label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
  { key: "upper", label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { key: "number", label: "One number", test: (v) => /[0-9]/.test(v) },
  { key: "special", label: "One special character", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export function passwordRuleResults(password) {
  const value = String(password || "");
  return PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(value) }));
}

export function isStrongPassword(password) {
  return passwordRuleResults(password).every((r) => r.passed);
}
