const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireStudent, requireActiveQuizSession } = require("../middleware/auth");
const studentController = require("../controllers/studentController");
const quizAttemptController = require("../controllers/quizAttemptController");

const router = express.Router();

// Public
router.get("/", studentController.listPublicQuizzes);
router.get("/:id", studentController.getPublicQuiz);
router.get("/:id/leaderboard", quizAttemptController.leaderboard);

// Requires an active student session (issued by POST /api/students/login).
// requireActiveQuizSession additionally enforces the single-active-session
// lock (see backend/src/middleware/auth.js) on every quiz-taking route, so a
// token that's been superseded by a newer login (or ended via
// POST /api/students/logout) can no longer save answers or otherwise act on
// the attempt.
router.post("/:id/start", requireStudent, requireActiveQuizSession, quizAttemptController.startAttempt);
router.post(
  "/:id/question/start",
  requireStudent,
  requireActiveQuizSession,
  quizAttemptController.activateQuestion
);
router.post("/:id/answer", requireStudent, requireActiveQuizSession, quizAttemptController.saveAnswer);
// Sandboxed execution is the most expensive endpoint in the app — cap it per
// client so a single student cannot flood the judge.
const codeExecLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

// Programming questions: Run against sample I/O, Submit against hidden tests.
router.post(
  "/:id/code/run",
  requireStudent,
  requireActiveQuizSession,
  codeExecLimiter,
  quizAttemptController.runCode
);
router.post(
  "/:id/code/submit",
  requireStudent,
  requireActiveQuizSession,
  codeExecLimiter,
  quizAttemptController.submitCode
);
router.post("/:id/violation", requireStudent, requireActiveQuizSession, quizAttemptController.logViolation);
router.post(
  "/:id/round/complete",
  requireStudent,
  requireActiveQuizSession,
  quizAttemptController.completeRound
);
router.post("/:id/submit", requireStudent, requireActiveQuizSession, quizAttemptController.submitAttempt);
router.get("/:id/result", requireStudent, quizAttemptController.myResult);

module.exports = router;
