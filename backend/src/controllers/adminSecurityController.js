const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

// GET /api/admin/logout-events — every forced quiz-attempt logout (a
// proctoring violation limit was reached and the attempt was auto-submitted
// + the student signed out), across every student/quiz, newest first. Each
// row carries the exact reason, a human-readable message, extra details
// (violations count / limit at the time) when available, and a timestamp —
// this is the Admin Portal's Security Log.
//
// Best-effort against `details` (see migration_logout_event_details.sql): an
// older database without that column still returns everything else instead
// of failing the whole request.
const listLogoutEvents = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const search = String(req.query.search || "").trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

  const withDetails = await supabase
    .from("student_logout_events")
    .select(
      "id, quiz_id, quiz_title, reason, message, details, created_at, students(id, name, register_number)"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  let rows = withDetails.data;
  if (withDetails.error) {
    // Older DB without the `details` column — retry without it.
    const withoutDetails = await supabase
      .from("student_logout_events")
      .select("id, quiz_id, quiz_title, reason, message, created_at, students(id, name, register_number)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (withoutDetails.error) throw new ApiError(500, "Failed to load security log", withoutDetails.error.message);
    rows = withoutDetails.data;
  }

  const q = search.toLowerCase();
  const filtered = (rows || []).filter((r) => {
    if (!q) return true;
    const name = String(r.students?.name || "").toLowerCase();
    const registerNumber = String(r.students?.register_number || "").toLowerCase();
    const quizTitle = String(r.quiz_title || "").toLowerCase();
    const reason = String(r.reason || "").toLowerCase();
    return name.includes(q) || registerNumber.includes(q) || quizTitle.includes(q) || reason.includes(q);
  });

  res.json({
    success: true,
    total: filtered.length,
    events: filtered.slice(0, limit).map((e) => ({
      id: e.id,
      studentId: e.students?.id || null,
      studentName: e.students?.name || "Unknown student",
      registerNumber: e.students?.register_number || "",
      quizId: e.quiz_id,
      quizTitle: e.quiz_title || "Untitled quiz",
      reason: e.reason,
      message: e.message,
      details: e.details || null,
      createdAt: e.created_at,
    })),
  });
});

module.exports = { listLogoutEvents };
