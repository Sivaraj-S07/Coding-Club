const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

// `batch`/`bio` are newer, optional profile columns (migration_student_profile.sql).
// A database that hasn't run that migration yet must not lose Admin → User
// Accounts / Guest Accounts over it — every query that selects them retries
// once without them, same pattern used in studentAccountController.js.
function isMissingProfileColumns(error) {
  const text = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    (/\bbatch\b/.test(text) || /\bbio\b/.test(text)) &&
    (text.includes("does not exist") || text.includes("could not find") || text.includes("schema cache"))
  );
}

// GET /api/admin/students?search=...&limit=...&accountType=registered|guest
// Search the master student registry by 12-digit register number (exact or
// partial) or by name (partial, case-insensitive). Returns basic profile
// info only — NEVER the password hash — use the detail endpoint below to
// drill into one student's quiz history. `limit` defaults to 50 (unchanged)
// and is capped at 500; used with a higher value by Admin → User/Guest
// Accounts. `accountType` narrows to only students who signed up for an
// account ("registered", i.e. `username` is set) or only students who
// attended a quiz without ever creating one ("guest", `username` is null) —
// omit it to get everyone, as before.
const searchStudents = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const search = String(req.query.search || "").trim();
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 50;
  const accountType = String(req.query.accountType || "").trim().toLowerCase();

  const buildQuery = (columns) => {
    let q = supabase
      .from("students")
      .select(columns)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (accountType === "registered") q = q.not("username", "is", null);
    else if (accountType === "guest") q = q.is("username", null);
    if (search) {
      const isDigits = /^[0-9]+$/.test(search);
      q = isDigits
        ? q.ilike("register_number", `%${search}%`)
        : q.or(`name.ilike.%${search}%,register_number.ilike.%${search}%`);
    }
    return q;
  };

  const fullColumns = "id, name, register_number, username, email, mobile_number, department, year, section, batch, created_at";
  let { data, error } = await buildQuery(fullColumns);
  if (error && isMissingProfileColumns(error)) {
    ({ data, error } = await buildQuery(
      "id, name, register_number, username, email, mobile_number, department, year, section, created_at"
    ));
  }
  if (error) throw new ApiError(500, "Failed to search students", error.message);

  res.json({
    success: true,
    students: (data || []).map((s) => ({
      id: s.id,
      name: s.name,
      registerNumber: s.register_number,
      username: s.username,
      email: s.email,
      mobileNumber: s.mobile_number,
      department: s.department,
      year: s.year,
      section: s.section,
      batch: s.batch ?? null,
      createdAt: s.created_at,
    })),
  });
});

// GET /api/admin/students/:id — one student's complete dashboard for the
// Admin User/Guest Accounts "View" drill-down: profile, every quiz attempt
// (MCQ, fill-in-the-blank and coding questions all live inside quiz
// attempts), a programming/coding-answer breakdown, attendance records and
// a recent activity log (forced logouts, joins, submissions).
const getStudentDetail = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { id } = req.params;

  const fullColumns = "id, name, register_number, username, email, mobile_number, department, year, section, batch, bio, created_at";
  let { data: student, error: studentError } = await supabase
    .from("students")
    .select(fullColumns)
    .eq("id", id)
    .maybeSingle();
  if (studentError && isMissingProfileColumns(studentError)) {
    ({ data: student, error: studentError } = await supabase
      .from("students")
      .select("id, name, register_number, username, email, mobile_number, department, year, section, created_at")
      .eq("id", id)
      .maybeSingle());
  }
  if (studentError) throw new ApiError(500, "Failed to load student", studentError.message);
  if (!student) throw new ApiError(404, "Student not found");

  const { data: attempts, error: attemptsError } = await supabase
    .from("quiz_attempts")
    .select(
      `id, quiz_id, status, attempt_number, obtained_marks, total_marks, percentage, passed,
       started_at, submitted_at, quizzes(id, title)`
    )
    .eq("student_id", id)
    .order("started_at", { ascending: false });
  if (attemptsError) throw new ApiError(500, "Failed to load quiz history", attemptsError.message);

  const attemptList = attempts || [];
  const attemptIds = attemptList.map((a) => a.id);
  const quizTitleByAttempt = new Map(attemptList.map((a) => [a.id, a.quizzes?.title || "Untitled quiz"]));

  // Coding/programming answers across every attempt — this is what powers
  // the "Programs" section of the dashboard (the standalone Programming /
  // Playground tab never touches the database, so a student's programming
  // activity on record is always via coding questions inside a quiz).
  let programs = [];
  if (attemptIds.length > 0) {
    const { data: codingAnswers, error: answersError } = await supabase
      .from("answers")
      .select("id, attempt_id, question_id, language, judge_result, marks_awarded, answered_at, questions(question_type, question_text)")
      .in("attempt_id", attemptIds);
    // Best-effort: an older database without the programming-judge migration
    // simply shows no programs instead of breaking the whole dashboard.
    if (!answersError) {
      programs = (codingAnswers || [])
        .filter((a) => a.questions?.question_type === "coding")
        .map((a) => ({
          id: a.id,
          quizTitle: quizTitleByAttempt.get(a.attempt_id) || "Untitled quiz",
          questionText: a.questions?.question_text || "",
          language: a.language || null,
          verdict: a.judge_result?.status || null,
          testsPassed: a.judge_result?.passed ?? null,
          testsTotal: a.judge_result?.total ?? null,
          marksAwarded: a.marks_awarded,
          answeredAt: a.answered_at,
        }))
        .sort((a, b) => new Date(b.answeredAt || 0) - new Date(a.answeredAt || 0));
    }
  }

  // Attendance — best-effort, same fallback pattern as everything else here.
  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select("id, quiz_id, join_time, quiz_start_time, submission_time, status, completed, quizzes(title)")
    .eq("student_id", id)
    .order("join_time", { ascending: false });

  // Standalone Playground practice runs (the public "Programming" tab) —
  // distinct from `programs` above, which is coding QUESTIONS answered
  // inside a quiz. Best-effort: a database that hasn't run
  // migration_playground_history.sql yet simply shows none.
  const { data: playgroundRows, error: playgroundError } = await supabase
    .from("playground_runs")
    .select("id, language, status, time_ms, created_at")
    .eq("student_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  const playgroundRuns = playgroundError
    ? []
    : (playgroundRows || []).map((r) => ({
        id: r.id,
        language: r.language,
        status: r.status,
        timeMs: r.time_ms,
        createdAt: r.created_at,
      }));

  // Recent activity — forced-logout events (proctoring auto-submits etc.).
  const { data: logoutEvents } = await supabase
    .from("student_logout_events")
    .select("id, quiz_title, reason, message, created_at")
    .eq("student_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Cumulative percentage across every graded attempt (submitted or
  // auto-submitted, with marks on record) — total marks obtained over total
  // marks possible, not an average of per-quiz percentages, so quizzes with
  // more questions weigh proportionally more. In-progress attempts (no
  // total_marks yet) are excluded so an unfinished quiz can't drag the
  // figure down. `null` (not `0`) when the student has no graded attempts
  // yet, so the UI can show "—" instead of a misleading 0%.
  const gradedAttempts = attemptList.filter(
    (a) => a.total_marks !== null && a.total_marks !== undefined && a.total_marks > 0
  );
  const sumObtained = gradedAttempts.reduce((sum, a) => sum + (Number(a.obtained_marks) || 0), 0);
  const sumTotal = gradedAttempts.reduce((sum, a) => sum + (Number(a.total_marks) || 0), 0);
  const cumulativePercentage = sumTotal > 0 ? Math.round((sumObtained / sumTotal) * 10000) / 100 : null;

  res.json({
    success: true,
    student: {
      id: student.id,
      name: student.name,
      registerNumber: student.register_number,
      username: student.username,
      email: student.email,
      mobileNumber: student.mobile_number,
      department: student.department,
      year: student.year,
      section: student.section,
      batch: student.batch ?? null,
      bio: student.bio ?? null,
      createdAt: student.created_at,
      cumulativePercentage,
    },
    summary: {
      quizzesAttempted: attemptList.length,
      programsAttempted: programs.length,
      attendanceRecorded: (attendanceRows || []).length,
      playgroundRunsRecorded: playgroundRuns.length,
    },
    attempts: attemptList.map((a) => ({
      id: a.id,
      quizId: a.quiz_id,
      quizTitle: a.quizzes?.title || "Untitled quiz",
      status: a.status,
      attemptNumber: a.attempt_number,
      obtainedMarks: a.obtained_marks,
      totalMarks: a.total_marks,
      percentage: a.percentage,
      passed: a.passed,
      startedAt: a.started_at,
      submittedAt: a.submitted_at,
    })),
    programs,
    playgroundRuns,
    attendance: (attendanceRows || []).map((r) => ({
      id: r.id,
      quizId: r.quiz_id,
      quizTitle: r.quizzes?.title || "Untitled quiz",
      status: r.status,
      completed: r.completed,
      joinTime: r.join_time,
      quizStartTime: r.quiz_start_time,
      submissionTime: r.submission_time,
    })),
    activity: (logoutEvents || []).map((e) => ({
      id: e.id,
      quizTitle: e.quiz_title || "",
      reason: e.reason,
      message: e.message,
      createdAt: e.created_at,
    })),
  });
});

// DELETE /api/admin/students/:id — permanently delete a student account and
// every record that belongs to it (quiz attempts, answers, attendance,
// forced-logout activity). Guarded by requireAdmin (see routes/admin.js) —
// only an authenticated admin session can reach this route — and the
// frontend only calls it after an explicit confirmation dialog. Deletes
// child rows explicitly, in dependency order, rather than relying solely on
// `on delete cascade`, so this also works cleanly on older databases whose
// foreign keys predate the cascade rules in schema.sql.
const deleteStudent = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { id } = req.params;
  if (!id) throw new ApiError(400, "Student id is required");

  const { data: student, error: findError } = await supabase
    .from("students")
    .select("id, name, register_number")
    .eq("id", id)
    .maybeSingle();
  if (findError) throw new ApiError(500, "Failed to load student", findError.message);
  if (!student) throw new ApiError(404, "Student not found or already deleted");

  const { data: attemptRows, error: attemptFindError } = await supabase
    .from("quiz_attempts")
    .select("id")
    .eq("student_id", id);
  if (attemptFindError) throw new ApiError(500, "Failed to load student's quiz attempts", attemptFindError.message);
  const attemptIds = (attemptRows || []).map((a) => a.id);

  if (attemptIds.length > 0) {
    const { error: answersError } = await supabase.from("answers").delete().in("attempt_id", attemptIds);
    if (answersError) throw new ApiError(500, "Failed to delete student's answers", answersError.message);
  }

  const { error: attemptsError } = await supabase.from("quiz_attempts").delete().eq("student_id", id);
  if (attemptsError) throw new ApiError(500, "Failed to delete student's quiz attempts", attemptsError.message);

  const { error: attendanceError } = await supabase.from("attendance").delete().eq("student_id", id);
  if (attendanceError) throw new ApiError(500, "Failed to delete student's attendance records", attendanceError.message);

  // Best-effort — this table may not exist on an older database that hasn't
  // run migration_logout_events.sql, and losing that history is not a reason
  // to block the delete itself.
  await supabase.from("student_logout_events").delete().eq("student_id", id);

  // Best-effort, same reasoning — migration_playground_history.sql may not
  // have run yet. (ON DELETE CASCADE on the FK would clean this up anyway
  // once it has; this just matches every other table's explicit-delete
  // pattern here for a database that predates that constraint.)
  await supabase.from("playground_runs").delete().eq("student_id", id);

  const { error: deleteError } = await supabase.from("students").delete().eq("id", id);
  if (deleteError) throw new ApiError(500, "Failed to delete student", deleteError.message);

  res.json({ success: true, message: `Deleted account for ${student.name} (${student.register_number})` });
});

module.exports = { searchStudents, getStudentDetail, deleteStudent };
