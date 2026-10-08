const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

const listAttendance = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { quizId, department, year, status, date } = req.query;

  let query = supabase
    .from("attendance")
    .select(
      `id, status, completed, join_time, quiz_start_time, submission_time,
       quizzes(id, title),
       students(id, name, register_number, department, year, section)`
    )
    .order("join_time", { ascending: false });

  if (quizId) query = query.eq("quiz_id", quizId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw new ApiError(500, "Failed to load attendance", error.message);

  let rows = (data || []).map((r) => ({
    id: r.id,
    quiz: r.quizzes ? { id: r.quizzes.id, title: r.quizzes.title } : null,
    student: r.students,
    status: r.status,
    completed: r.completed,
    joinTime: r.join_time,
    quizStartTime: r.quiz_start_time,
    submissionTime: r.submission_time,
  }));

  if (department) rows = rows.filter((r) => r.student?.department === department);
  if (year) rows = rows.filter((r) => r.student?.year === year);
  if (date) {
    rows = rows.filter((r) => r.joinTime && r.joinTime.slice(0, 10) === date);
  }

  res.json({ success: true, attendance: rows });
});

module.exports = { listAttendance };
