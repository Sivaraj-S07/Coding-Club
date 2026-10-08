const { verifyToken } = require("../utils/jwt");
const { ApiError } = require("../utils/asyncHandler");
const { getSupabase } = require("../config/supabaseClient");
const { sessionLockSupported } = require("../utils/featureSupport");

function getTokenFromHeader(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

function requireAdmin(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) return next(new ApiError(401, "Missing admin token"));
  try {
    const payload = verifyToken(token);
    if (payload.role !== "admin") {
      return next(new ApiError(403, "Admin access required"));
    }
    req.admin = payload;
    next();
  } catch (err) {
    next(new ApiError(401, "Invalid or expired admin session"));
  }
}

function requireStudent(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) return next(new ApiError(401, "Missing student session token"));
  try {
    const payload = verifyToken(token);
    if (payload.role !== "student") {
      return next(new ApiError(403, "Student access required"));
    }
    req.student = payload;
    next();
  } catch (err) {
    next(new ApiError(401, "Invalid or expired quiz session"));
  }
}

// The AI learning features (profile, adaptive practice, tutor, ...) belong to
// a signed-in student ACCOUNT. A token minted by the per-quiz "join as guest"
// flow (POST /api/students/login) has role "student" too but no `account`
// flag, and must not unlock them.
function requireStudentAccount(req, res, next) {
  requireStudent(req, res, (err) => {
    if (err) return next(err);
    if (!req.student.account) {
      return next(new ApiError(403, "Sign in to your student account to use the AI learning features"));
    }
    next();
  });
}

// Defense-in-depth for the single-active-quiz-session lock: a token minted
// by POST /api/students/login carries the session id that was current at
// join time (`sessionToken`). If a newer session has since been acquired for
// this Register Number (see studentController.acquireQuizSession) — or the
// student explicitly logged out — this older token is rejected instead of
// being allowed to keep saving answers into the quiz. Only applied to the
// quiz-taking routes (start/answer/code/submit/...), never to the general
// Dashboard account session, so switching devices to just browse the
// Dashboard can never interrupt an in-progress quiz elsewhere.
async function requireActiveQuizSession(req, res, next) {
  try {
    // No sessionToken on the token at all means either this feature's
    // migration hasn't run yet, or the token predates this feature — treat
    // it as "no lock to check" rather than blocking a valid session.
    if (!req.student?.sessionToken) return next();
    if (!(await sessionLockSupported())) return next();

    const supabase = getSupabase();
    const { data: student, error } = await supabase
      .from("students")
      .select("active_session_token")
      .eq("id", req.student.studentId)
      .maybeSingle();
    // Fail open on an infra error — never let a transient DB hiccup break an
    // otherwise-valid quiz attempt.
    if (error || !student) return next();

    if (student.active_session_token && student.active_session_token !== req.student.sessionToken) {
      return next(
        new ApiError(
          401,
          "This Register Number signed in from another session. Log in again here to resume this quiz."
        )
      );
    }
    next();
  } catch {
    next();
  }
}

// Attaches req.student when a valid Bearer token is present, but — unlike
// requireStudent — never rejects the request when it's missing or invalid.
// Used only on the public Playground run endpoint, which must keep working
// for a signed-out visitor: a logged-in student's runs get attributed and
// saved to their account, everyone else's still execute exactly as before,
// just without being saved anywhere.
function optionalStudentAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    if (payload.role === "student") req.student = payload;
  } catch {
    // Invalid/expired token on an endpoint that doesn't require one — treat
    // exactly like "not signed in" rather than blocking the request.
  }
  next();
}

module.exports = { requireAdmin, requireStudent, requireStudentAccount, requireActiveQuizSession, optionalStudentAuth };
