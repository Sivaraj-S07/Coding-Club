const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

// GET /api/admin/live/:quizId — polling snapshot of quiz activity.
// (No websockets in this build — the frontend polls this endpoint every few
// seconds. See README "Real-time upgrade path" for a Socket.IO alternative.)
const liveSnapshot = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { quizId } = req.params;

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .select("id, title, status")
    .eq("id", quizId)
    .maybeSingle();
  if (quizError) throw new ApiError(500, "Failed to load quiz", quizError.message);
  if (!quiz) throw new ApiError(404, "Quiz not found");

  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select("student_id")
    .eq("quiz_id", quizId);

  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("id, status, obtained_marks, violations_count, students(id, name, register_number)")
    .eq("quiz_id", quizId)
    .order("obtained_marks", { ascending: false });

  const joined = attendanceRows?.length || 0;
  const active = (attempts || []).filter((a) => a.status === "in_progress").length;
  const submitted = (attempts || []).filter(
    (a) => a.status === "submitted" || a.status === "auto_submitted"
  ).length;
  const notStarted = Math.max(0, joined - (attempts || []).length);

  res.json({
    success: true,
    quiz,
    tiles: {
      online: joined,
      active,
      submitted,
      notStarted,
    },
    ranking: (attempts || [])
      .filter((a) => a.status === "in_progress" || a.status === "submitted" || a.status === "auto_submitted")
      .map((a, idx) => ({
        rank: idx + 1,
        attemptId: a.id,
        studentId: a.students?.id,
        name: a.students?.name,
        registerNumber: a.students?.register_number,
        score: a.obtained_marks,
        violations: a.violations_count,
        status: a.status,
      })),
  });
});

module.exports = { liveSnapshot };
