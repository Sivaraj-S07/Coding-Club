const express = require("express");
const { requireStudent } = require("../middleware/auth");
const studentController = require("../controllers/studentController");
const studentAccountController = require("../controllers/studentAccountController");

const router = express.Router();

router.post("/login", studentController.joinQuiz);
router.get("/profile", requireStudent, studentController.getProfile);
// Ends only the caller's active quiz-session lock (Maximum Attempt + Resume
// Quiz system) — the in-progress attempt itself is left untouched so it can
// be resumed later. See studentController.logoutSession.
router.post("/logout", requireStudent, studentController.logoutSession);
router.get("/quizzes", studentController.listPublicQuizzes);

// Student self-service account (Sign Up / Sign In) — separate from the
// per-quiz join flow above. Powers the Landing page and the Dashboard.
router.post("/register", studentAccountController.registerAccount);
router.post("/signin", studentAccountController.signIn);
router.get("/account", requireStudent, studentAccountController.getAccount);
router.get("/account/logout-events", requireStudent, studentAccountController.listLogoutEvents);
// Profile: edit photo / bio / username. Register Number is never accepted.
router.put("/account", requireStudent, studentAccountController.updateAccount);
router.put("/account/password", requireStudent, studentAccountController.changePassword);

module.exports = router;
