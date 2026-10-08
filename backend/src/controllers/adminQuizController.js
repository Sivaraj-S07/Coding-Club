const bcrypt = require("bcryptjs");
const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

// Detect "the placement column doesn't exist yet" (migration_landing_
// quizzes.sql not run). The pre-existing Admin Quizzes tab must never break
// because of this — only the brand-new Landing Quizzes tab is allowed to
// surface a clear "run this migration" message.
function isMissingPlacementColumn(error) {
  const text = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return /placement/.test(text) && (text.includes("does not exist") || text.includes("could not find") || text.includes("schema cache"));
}

function placementSetupError() {
  return new ApiError(
    500,
    "Landing Page Quizzes aren't set up in this database yet. In Supabase, run backend/sql/migration_landing_quizzes.sql (it's also included in schema.sql for new databases)."
  );
}

function normalizePlacement(value) {
  return value === "landing" ? "landing" : "quizzes";
}

// Older databases may not have quizzes.placement yet. Retry once without it
// so the ORIGINAL Admin Quizzes tab (implicit placement='quizzes') keeps
// working even before the migration is applied — only an explicit request
// for the landing list, or an explicit attempt to set placement:'landing',
// needs to fail with a clear setup message.
async function selectQuizzesWithPlacementFallback(supabase, placement) {
  const filtered = await supabase
    .from("quizzes")
    .select("*")
    .eq("placement", placement)
    .order("created_at", { ascending: false });
  if (!filtered.error) return filtered;
  if (!isMissingPlacementColumn(filtered.error)) return filtered;
  if (placement === "landing") return filtered; // caller throws placementSetupError
  // Default 'quizzes' view, pre-migration: fall back to the unfiltered list
  // (its old behaviour) instead of breaking the whole tab.
  return supabase.from("quizzes").select("*").order("created_at", { ascending: false });
}

function quizPublicShape(q) {
  return {
    id: q.id,
    title: q.title,
    description: q.description,
    durationMinutes: q.duration_minutes,
    startTime: q.start_time,
    endTime: q.end_time,
    maxMarks: q.max_marks,
    passingPercentage: q.passing_percentage,
    maxAttempts: q.max_attempts,
    randomizeQuestions: q.randomize_questions,
    randomizeOptions: q.randomize_options,
    autoSubmit: q.auto_submit,
    allowLateJoin: q.allow_late_join,
    showLeaderboard: q.show_leaderboard,
    tabSwitchLimit: q.tab_switch_limit,
    status: q.status,
    placement: q.placement || "quizzes",
    createdAt: q.created_at,
    updatedAt: q.updated_at,
  };
}

// GET /api/admin/quizzes?placement=quizzes|landing — defaults to 'quizzes'
// (the normal Admin Quizzes tab) so pre-existing behaviour is unchanged;
// pass ?placement=landing for the separate Landing Page Quizzes tab.
const listQuizzes = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const placement = normalizePlacement(req.query.placement);
  const { data: quizzes, error } = await selectQuizzesWithPlacementFallback(supabase, placement);
  if (error) {
    if (isMissingPlacementColumn(error)) throw placementSetupError();
    throw new ApiError(500, "Failed to load quizzes", error.message);
  }

  const { data: questionCounts } = await supabase
    .from("questions")
    .select("quiz_id");
  const { data: attemptCounts } = await supabase
    .from("quiz_attempts")
    .select("quiz_id");

  const qCountMap = {};
  (questionCounts || []).forEach((r) => {
    qCountMap[r.quiz_id] = (qCountMap[r.quiz_id] || 0) + 1;
  });
  const aCountMap = {};
  (attemptCounts || []).forEach((r) => {
    aCountMap[r.quiz_id] = (aCountMap[r.quiz_id] || 0) + 1;
  });

  res.json({
    success: true,
    quizzes: quizzes.map((q) => ({
      ...quizPublicShape(q),
      questionCount: qCountMap[q.id] || 0,
      participantCount: aCountMap[q.id] || 0,
    })),
  });
});

const getQuiz = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { data: quiz, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();
  if (error) throw new ApiError(500, "Failed to load quiz", error.message);
  if (!quiz) throw new ApiError(404, "Quiz not found");
  res.json({ success: true, quiz: quizPublicShape(quiz) });
});

function validateQuizPayload(body, { requirePassword, requireTitle }) {
  const errors = [];
  if (requireTitle) {
    if (!body.title || !String(body.title).trim()) errors.push("title is required");
  } else if (body.title !== undefined && !String(body.title).trim()) {
    errors.push("title cannot be empty");
  }
  if (requirePassword && !body.password) errors.push("password is required");
  if (body.durationMinutes !== undefined && Number(body.durationMinutes) <= 0)
    errors.push("durationMinutes must be greater than 0");
  if (body.maxMarks !== undefined && Number(body.maxMarks) < 0)
    errors.push("maxMarks cannot be negative");
  if (
    body.status !== undefined &&
    !["draft", "upcoming", "live", "completed"].includes(body.status)
  )
    errors.push("status must be one of draft, upcoming, live, completed");
  if (errors.length) throw new ApiError(400, "Validation failed", errors);
}

const createQuiz = asyncHandler(async (req, res) => {
  const body = req.body || {};
  validateQuizPayload(body, { requirePassword: true, requireTitle: true });
  const supabase = getSupabase();
  const wantsLanding = body.placement === "landing";

  const row = {
    title: String(body.title).trim(),
    description: body.description || "",
    password_hash: bcrypt.hashSync(String(body.password), 10),
    duration_minutes: Number(body.durationMinutes) || 30,
    start_time: body.startTime || null,
    end_time: body.endTime || null,
    max_marks: Number(body.maxMarks) || 0,
    passing_percentage: Number(body.passingPercentage ?? 40),
    max_attempts: Number(body.maxAttempts ?? 1),
    randomize_questions: body.randomizeQuestions ?? true,
    randomize_options: body.randomizeOptions ?? true,
    auto_submit: body.autoSubmit ?? true,
    allow_late_join: body.allowLateJoin ?? false,
    show_leaderboard: body.showLeaderboard ?? true,
    tab_switch_limit: Number(body.tabSwitchLimit ?? 3),
    status: body.status || "draft",
    placement: normalizePlacement(body.placement),
  };

  let { data: quiz, error } = await supabase.from("quizzes").insert(row).select("*").single();
  if (error && isMissingPlacementColumn(error)) {
    // Explicitly asked for a landing quiz but the migration hasn't run —
    // that's a real setup problem, surface it clearly.
    if (wantsLanding) throw placementSetupError();
    // Otherwise (the normal "New Quiz" flow): drop the column and retry, so
    // quiz creation keeps working exactly as it did before this update.
    const { placement, ...rowWithoutPlacement } = row;
    ({ data: quiz, error } = await supabase.from("quizzes").insert(rowWithoutPlacement).select("*").single());
  }
  if (error) throw new ApiError(500, "Failed to create quiz", error.message);

  res.status(201).json({ success: true, quiz: quizPublicShape(quiz) });
});

const updateQuiz = asyncHandler(async (req, res) => {
  const body = req.body || {};
  validateQuizPayload(body, { requirePassword: false, requireTitle: false });
  const supabase = getSupabase();
  const wantsLanding = body.placement === "landing";

  const row = {
    ...(body.title !== undefined ? { title: String(body.title).trim() } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.password ? { password_hash: bcrypt.hashSync(String(body.password), 10) } : {}),
    ...(body.durationMinutes !== undefined ? { duration_minutes: Number(body.durationMinutes) } : {}),
    ...(body.startTime !== undefined ? { start_time: body.startTime || null } : {}),
    ...(body.endTime !== undefined ? { end_time: body.endTime || null } : {}),
    ...(body.maxMarks !== undefined ? { max_marks: Number(body.maxMarks) } : {}),
    ...(body.passingPercentage !== undefined ? { passing_percentage: Number(body.passingPercentage) } : {}),
    ...(body.maxAttempts !== undefined ? { max_attempts: Number(body.maxAttempts) } : {}),
    ...(body.randomizeQuestions !== undefined ? { randomize_questions: body.randomizeQuestions } : {}),
    ...(body.randomizeOptions !== undefined ? { randomize_options: body.randomizeOptions } : {}),
    ...(body.autoSubmit !== undefined ? { auto_submit: body.autoSubmit } : {}),
    ...(body.allowLateJoin !== undefined ? { allow_late_join: body.allowLateJoin } : {}),
    ...(body.showLeaderboard !== undefined ? { show_leaderboard: body.showLeaderboard } : {}),
    ...(body.tabSwitchLimit !== undefined ? { tab_switch_limit: Number(body.tabSwitchLimit) } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.placement !== undefined ? { placement: normalizePlacement(body.placement) } : {}),
    updated_at: new Date().toISOString(),
  };

  let { data: quiz, error } = await supabase
    .from("quizzes")
    .update(row)
    .eq("id", req.params.id)
    .select("*")
    .maybeSingle();
  if (error && isMissingPlacementColumn(error)) {
    if (wantsLanding) throw placementSetupError();
    // Not touching placement, migration just hasn't run yet — retry without
    // that field so every other edit (title, password, settings, ...)
    // keeps working exactly as it did before this update.
    const { placement, ...rowWithoutPlacement } = row;
    ({ data: quiz, error } = await supabase
      .from("quizzes")
      .update(rowWithoutPlacement)
      .eq("id", req.params.id)
      .select("*")
      .maybeSingle());
  }
  if (error) throw new ApiError(500, "Failed to update quiz", error.message);
  if (!quiz) throw new ApiError(404, "Quiz not found");

  res.json({ success: true, quiz: quizPublicShape(quiz) });
});

const deleteQuiz = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { error } = await supabase.from("quizzes").delete().eq("id", req.params.id);
  if (error) throw new ApiError(500, "Failed to delete quiz", error.message);
  res.json({ success: true, message: "Quiz deleted" });
});

const setPublishStatus = asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!["draft", "upcoming", "live", "completed"].includes(status)) {
    throw new ApiError(400, "status must be one of draft, upcoming, live, completed");
  }
  const supabase = getSupabase();
  const { data: quiz, error } = await supabase
    .from("quizzes")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select("*")
    .maybeSingle();
  if (error) throw new ApiError(500, "Failed to update quiz status", error.message);
  if (!quiz) throw new ApiError(404, "Quiz not found");
  res.json({ success: true, quiz: quizPublicShape(quiz) });
});

const dashboardStats = asyncHandler(async (req, res) => {
  const supabase = getSupabase();

  const [quizzesRes, studentsRes, attemptsRes] = await Promise.all([
    supabase.from("quizzes").select("id, status, title"),
    supabase.from("students").select("id"),
    supabase
      .from("quiz_attempts")
      .select("id, status, percentage, obtained_marks, submitted_at, quiz_id, student_id")
      .order("submitted_at", { ascending: false }),
  ]);

  const firstError = quizzesRes.error || studentsRes.error || attemptsRes.error;
  if (firstError) {
    throw new ApiError(500, "Failed to load dashboard stats", firstError.message);
  }

  const quizzes = quizzesRes.data;
  const students = studentsRes.data;
  const attempts = attemptsRes.data;

  const totalQuizzes = quizzes?.length || 0;
  const activeQuizzes = (quizzes || []).filter((q) => q.status === "live").length;
  const completedQuizzes = (quizzes || []).filter((q) => q.status === "completed").length;
  const totalStudents = students?.length || 0;

  const submitted = (attempts || []).filter(
    (a) => a.status === "submitted" || a.status === "auto_submitted"
  );
  const totalParticipants = attempts?.length || 0;
  const avgScore =
    submitted.length > 0
      ? submitted.reduce((sum, a) => sum + (Number(a.percentage) || 0), 0) / submitted.length
      : 0;

  // Attendance-based present/absent counts
  const { data: attendanceRows, error: attendanceError } = await supabase.from("attendance").select("status");
  if (attendanceError) console.error("[dashboardStats] attendance query failed:", attendanceError.message);
  const present = (attendanceRows || []).filter((a) => a.status === "present").length;
  const absent = (attendanceRows || []).filter((a) => a.status === "absent").length;

  const quizTitleById = Object.fromEntries((quizzes || []).map((q) => [q.id, q.title]));
  const { data: recentAttempts, error: recentError } = await supabase
    .from("quiz_attempts")
    .select("id, quiz_id, student_id, obtained_marks, submitted_at, students(name)")
    .in("status", ["submitted", "auto_submitted"])
    .order("submitted_at", { ascending: false })
    .limit(8);
  if (recentError) console.error("[dashboardStats] recent attempts query failed:", recentError.message);

  res.json({
    success: true,
    stats: {
      totalStudents,
      totalQuizzes,
      activeQuizzes,
      completedQuizzes,
      totalParticipants,
      present,
      absent,
      averageScore: Math.round(avgScore * 10) / 10,
    },
    recentActivity: (recentAttempts || []).map((a) => ({
      name: a.students?.name || "Unknown",
      quiz: quizTitleById[a.quiz_id] || "Quiz",
      score: a.obtained_marks,
      submittedAt: a.submitted_at,
    })),
  });
});

module.exports = {
  listQuizzes,
  getQuiz,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  setPublishStatus,
  dashboardStats,
  // Shared with adminQuizCopyController (Copy / Paste Quiz).
  quizPublicShape,
  isMissingPlacementColumn,
  placementSetupError,
};
