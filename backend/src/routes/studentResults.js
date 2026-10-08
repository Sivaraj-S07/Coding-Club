const express = require("express");
const { requireStudent } = require("../middleware/auth");
const { listMyResults, getMyAttemptDetail } = require("../controllers/studentResultsController");

const router = express.Router();

// GET /api/student/results — all of the current student's submitted results
// (Dashboard: attended quizzes + cumulative percentage).
router.get("/", requireStudent, listMyResults);

// GET /api/student/results/:attemptId — full saved/submitted answers and
// code for one attempt (Dashboard: "view my submitted data").
router.get("/:attemptId", requireStudent, getMyAttemptDetail);

module.exports = router;
