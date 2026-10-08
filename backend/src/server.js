const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const env = require("./config/env");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const compression = require("./middleware/compression");
const { requireAdmin } = require("./middleware/auth");
const { initRealtime } = require("./realtime");

const adminRoutes = require("./routes/admin");
const studentRoutes = require("./routes/students");
const quizRoutes = require("./routes/quizzes");
const playgroundRoutes = require("./routes/playground");
const studentResultsRoutes = require("./routes/studentResults");
const mediaRoutes = require("./routes/media");
const aiRoutes = require("./routes/ai");

// Defense-in-depth: by default Node (>=15) terminates the *entire* process
// on any unhandled rejection, which would otherwise take down every
// in-flight request over a single background-job hiccup. Log loudly instead
// of crashing.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandled rejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaught exception]", err);
});

const app = express();

// Render (and most reverse proxies) forwards X-Forwarded-For. Trust the
// first proxy so express-rate-limit can accurately identify clients.
app.set("trust proxy", 1);

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    credentials: true,
  })
);
// Import Quiz from PDF sends an entire quiz (every question, answer option,
// hidden test case, ...) in a single request, which can be larger than the
// general 3mb cap below. Only that one admin-only route gets the higher limit,
// and the admin check runs BEFORE the body is read so an anonymous caller can
// never make the server buffer a large payload.
app.use("/api/admin/quizzes/import", requireAdmin, express.json({ limit: "12mb" }));
// 3mb (was 1mb) so a student's profile photo (base64 data URL, capped at
// ~1.5MB decoded in the controller) fits in the JSON body alongside the
// rest of the payload. Every other endpoint keeps working unchanged since
// this only raises the ceiling.
app.use(express.json({ limit: "3mb" }));
if (env.NODE_ENV !== "test") {
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
}

// Basic rate limiting — generous defaults, tighter on auth endpoints.
const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 300 });
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });
app.use("/api", generalLimiter);
app.use("/api/admin/login", authLimiter);
app.use("/api/students/login", authLimiter);
app.use("/api/students/register", authLimiter);
app.use("/api/students/signin", authLimiter);
app.use("/api/students/account/password", authLimiter);

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Quiz Assessment API is running" });
});

app.use("/api/admin", adminRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/student/results", studentResultsRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/playground", playgroundRoutes);
app.use("/api/media", mediaRoutes);
// AI learning platform: profile, adaptive practice, tutor, simplifier, recommendations.
app.use("/api/ai", aiRoutes);
app.use("/api/teams", require("./routes/teams"));

app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = http.createServer(app);

// Socket.IO — admin-only realtime channel (new registrations, submissions,
// result updates). Admins authenticate with the same JWT used by the REST API.
initRealtime(
  httpServer,
  env.CORS_ORIGIN.split(",").map((o) => o.trim())
);

httpServer.listen(env.PORT, () => {
  console.log(`Quiz Assessment API listening on port ${env.PORT}`);
  // Discover the pre-installed language runtimes once, at boot. Nothing is
  // ever installed or downloaded while a student presses Run / Submit.
  require("./utils/localRunner")
    .warmupRuntimes()
    .catch((err) => console.warn("[judge] runtime warmup failed:", err.message));

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — database routes will fail until backend/.env is configured."
    );
  }
});

module.exports = app;
