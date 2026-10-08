const express = require("express");
const rateLimit = require("express-rate-limit");
const playgroundController = require("../controllers/playgroundController");
const { optionalStudentAuth, requireStudent } = require("../middleware/auth");

const router = express.Router();

// Sandboxed execution is the most expensive endpoint in the app, and this one
// is public, so it gets a tighter budget than the in-quiz judge.
const runLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

router.get("/languages", playgroundController.listLanguages);
// optionalStudentAuth: Playground stays usable without signing in — it just
// attaches req.student (and so saves the run to the Dashboard) when a valid
// account token is sent.
router.post("/run", runLimiter, optionalStudentAuth, playgroundController.runSnippet);
// Signed-in only: a student's own saved practice runs, for the Dashboard.
router.get("/history", requireStudent, playgroundController.listMyHistory);

module.exports = router;
