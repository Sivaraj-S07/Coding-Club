const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

// A deployment that has not run the latest schema.sql yet returns a
// "relation does not exist" / schema-cache error instead of rows.
function isMissingRelation(error) {
  const text = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return (
    text.includes("42p01") ||
    text.includes("does not exist") ||
    text.includes("could not find the table") ||
    text.includes("schema cache")
  );
}

const listParticipants = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { quizId, department, year, section, search } = req.query;

  let query = supabase
    .from("attendance")
    .select(
      `id, status, completed, join_time, quiz_start_time, submission_time,
       quizzes(id, title),
       students(id, name, register_number, email, department, year, section),
       quiz_attempts(id, status, obtained_marks, total_marks, percentage)`
    )
    .order("join_time", { ascending: false });

  if (quizId) query = query.eq("quiz_id", quizId);

  const { data, error } = await query;
  if (error) throw new ApiError(500, "Failed to load participants", error.message);

  let rows = (data || []).map((r) => ({
    attendanceId: r.id,
    quiz: r.quizzes ? { id: r.quizzes.id, title: r.quizzes.title } : null,
    student: r.students,
    loginStatus: "logged_in",
    attendanceStatus: r.status,
    completed: r.completed,
    joinTime: r.join_time,
    quizStartTime: r.quiz_start_time,
    submissionTime: r.submission_time,
    score: r.quiz_attempts?.[0]?.obtained_marks ?? null,
    attemptStatus: r.quiz_attempts?.[0]?.status ?? "not_started",
  }));

  if (department) rows = rows.filter((r) => r.student?.department === department);
  if (year) rows = rows.filter((r) => r.student?.year === year);
  if (section) rows = rows.filter((r) => r.student?.section === section);
  if (search) {
    const q = String(search).toLowerCase();
    rows = rows.filter(
      (r) =>
        r.student?.name?.toLowerCase().includes(q) ||
        r.student?.register_number?.toLowerCase().includes(q) ||
        r.student?.email?.toLowerCase().includes(q)
    );
  }

  res.json({ success: true, participants: rows });
});


/**
 * Participation list for ONE quiz (Admin Portal → Participation tab).
 * GET /api/admin/quizzes/:quizId/participants
 */
const listQuizParticipation = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { quizId } = req.params;
  if (!quizId) throw new ApiError(400, "Quiz id is required");

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .select("id, title")
    .eq("id", quizId)
    .maybeSingle();
  if (quizError) throw new ApiError(500, "Failed to load quiz", quizError.message);
  if (!quiz) throw new ApiError(404, "Quiz not found");

  // Attendance is the primary source of participation. Some deployments have
  // not run the latest schema.sql yet (no attendance table / no rows), so the
  // list also falls back to quiz_attempts instead of failing with an error.
  const { data: attendanceRows, error } = await supabase
    .from("attendance")
    .select(
      `id, status, completed, join_time, quiz_start_time, submission_time,
       students(id, name, register_number, email, department, year, section)`
    )
    .eq("quiz_id", quizId)
    .order("join_time", { ascending: false });
  if (error && !isMissingRelation(error)) {
    throw new ApiError(500, "Failed to load participation records", error.message);
  }

  const { data: attempts, error: attemptsError } = await supabase
    .from("quiz_attempts")
    .select(
      `id, student_id, status, obtained_marks, total_marks, percentage, attempt_number,
       started_at, submitted_at,
       students(id, name, register_number, email, department, year, section)`
    )
    .eq("quiz_id", quizId)
    .order("attempt_number", { ascending: true });
  if (attemptsError && !isMissingRelation(attemptsError)) {
    throw new ApiError(500, "Failed to load quiz attempts", attemptsError.message);
  }

  const attemptByStudent = new Map();
  (attempts || []).forEach((a) => {
    if (a.student_id != null) attemptByStudent.set(String(a.student_id), a);
  });

  const seenStudents = new Set();
  const participants = (attendanceRows || []).map((r) => {
    const student = r.students || {};
    const attempt = attemptByStudent.get(String(student.id));
    if (student.id != null) seenStudents.add(String(student.id));
    return {
      id: r.id,
      source: "attendance",
      quizId: quiz.id,
      quizTitle: quiz.title,
      studentId: student.id ?? null,
      name: student.name ?? "Unknown",
      registerNumber: student.register_number ?? null,
      email: student.email ?? null,
      department: student.department ?? null,
      year: student.year ?? null,
      section: student.section ?? null,
      participatedAt: r.join_time ?? attempt?.started_at ?? null,
      quizStartTime: r.quiz_start_time,
      submissionTime: r.submission_time ?? attempt?.submitted_at ?? null,
      attendanceStatus: r.status,
      completed: r.completed,
      score: attempt?.obtained_marks ?? null,
      totalMarks: attempt?.total_marks ?? null,
      percentage: attempt?.percentage ?? null,
      attemptStatus: attempt?.status ?? "not_started",
    };
  });

  // Students who have an attempt but no attendance row still participated.
  (attempts || []).forEach((a) => {
    const student = a.students || {};
    if (student.id != null && seenStudents.has(String(student.id))) return;
    participants.push({
      id: `attempt:${a.id}`,
      source: "attempt",
      quizId: quiz.id,
      quizTitle: quiz.title,
      studentId: student.id ?? a.student_id ?? null,
      name: student.name ?? "Unknown",
      registerNumber: student.register_number ?? null,
      email: student.email ?? null,
      department: student.department ?? null,
      year: student.year ?? null,
      section: student.section ?? null,
      participatedAt: a.started_at ?? null,
      quizStartTime: a.started_at ?? null,
      submissionTime: a.submitted_at ?? null,
      attendanceStatus: a.status ?? null,
      completed: a.status === "submitted" || a.status === "auto_submitted",
      score: a.obtained_marks ?? null,
      totalMarks: a.total_marks ?? null,
      percentage: a.percentage ?? null,
      attemptStatus: a.status ?? "not_started",
    });
  });

  participants.sort((x, y) => new Date(y.participatedAt || 0) - new Date(x.participatedAt || 0));

  res.json({
    success: true,
    quiz: { id: quiz.id, title: quiz.title },
    total: participants.length,
    participants,
  });
});

/**
 * Delete a single participation (attendance) record.
 * DELETE /api/admin/quizzes/:quizId/participants/:id
 *
 * Only the attendance row for this one student + quiz is removed. Questions,
 * rounds, results/attempts, other participants and the quiz itself are all
 * left untouched.
 */
const deleteQuizParticipation = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { quizId, id } = req.params;
  if (!quizId || !id) throw new ApiError(400, "Quiz id and participation id are required");

  // Rows sourced from quiz_attempts (no attendance record) use an "attempt:" id.
  if (String(id).startsWith("attempt:")) {
    const attemptId = String(id).slice("attempt:".length);
    const { data: attempt, error: attemptFindError } = await supabase
      .from("quiz_attempts")
      .select("id, quiz_id")
      .eq("id", attemptId)
      .maybeSingle();
    if (attemptFindError) throw new ApiError(500, "Failed to load participation record", attemptFindError.message);
    if (!attempt) throw new ApiError(404, "Participation record not found or already deleted");
    if (String(attempt.quiz_id) !== String(quizId)) {
      throw new ApiError(400, "This participation record does not belong to the selected quiz");
    }
    const { error: attemptDeleteError } = await supabase
      .from("quiz_attempts")
      .delete()
      .eq("id", attemptId)
      .eq("quiz_id", quizId);
    if (attemptDeleteError) {
      throw new ApiError(500, "Failed to delete participation record", attemptDeleteError.message);
    }
    return res.json({ success: true, deletedId: id });
  }

  const { data: existing, error: findError } = await supabase
    .from("attendance")
    .select("id, quiz_id")
    .eq("id", id)
    .maybeSingle();
  if (findError) throw new ApiError(500, "Failed to load participation record", findError.message);
  if (!existing) throw new ApiError(404, "Participation record not found or already deleted");
  if (String(existing.quiz_id) !== String(quizId)) {
    throw new ApiError(400, "This participation record does not belong to the selected quiz");
  }

  const { error: deleteError } = await supabase
    .from("attendance")
    .delete()
    .eq("id", id)
    .eq("quiz_id", quizId);
  if (deleteError) throw new ApiError(500, "Failed to delete participation record", deleteError.message);

  res.json({ success: true, deletedId: id });
});

module.exports = { listParticipants, listQuizParticipation, deleteQuizParticipation };

