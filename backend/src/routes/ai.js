const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireStudentAccount } = require("../middleware/auth");
const learning = require("../controllers/aiLearningController");
const tutor = require("../controllers/aiTutorController");

const router = express.Router();

// Limits are per signed-in student (falling back to IP), not per IP, so a
// whole classroom behind one college NAT doesn't share a single budget.
const keyByStudent = (req) => (req.student && req.student.studentId) || req.ip;
const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 90, keyGenerator: keyByStudent });
// LLM calls are the expensive ones.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: keyByStudent,
  message: { success: false, message: "You're asking very quickly — wait a few seconds and try again." },
});

// Public: lets the UI show whether the full AI or the built-in tutor is active.
router.get("/status", tutor.getStatus);

// Everything below needs a signed-in student account.
router.use(requireStudentAccount);
router.use(generalLimiter);

router.get("/profile", learning.getProfile);
router.put("/profile", learning.updateProfile);
router.get("/curriculum", learning.getCurriculum);
router.get("/recommendations", learning.getRecommendations);

router.get("/adaptive", learning.listAdaptiveSessions);
router.post("/adaptive/start", learning.startAdaptive);
router.get("/adaptive/:sessionId", learning.getAdaptiveSession);
router.post("/adaptive/:sessionId/answer", learning.answerAdaptive);

router.post("/tutor", aiLimiter, tutor.askTutor);
router.post("/simplify", aiLimiter, tutor.simplifyContent);

module.exports = router;
