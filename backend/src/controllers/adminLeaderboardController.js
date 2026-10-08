const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

// GET /api/admin/leaderboard
//
// Cumulative-percentage leaderboard across every quiz a student has taken
// (same "average of each attempt's percentage" formula the student
// Dashboard already uses for its own cumulative percentage — see
// studentResultsController.listMyResults).
//
// Signed-in (registered) students — students.username is set — are ranked
// together in `leaderboard`. Guest accounts (attended a quiz without ever
// creating an account, students.username is null; same test used by
// Admin -> User Accounts / Guest Accounts) are returned separately in
// `guests` with their own independent ranking, and are never mixed into the
// signed-in ranking.
const getLeaderboard = asyncHandler(async (req, res) => {
  const supabase = getSupabase();

  const { data: attempts, error } = await supabase
    .from("quiz_attempts")
    .select(
      "student_id, percentage, submitted_at, students(id, name, register_number, username, department, year, section)"
    )
    .in("status", ["submitted", "auto_submitted"]);
  if (error) throw new ApiError(500, "Failed to load leaderboard", error.message);

  const byStudent = new Map();
  (attempts || []).forEach((a) => {
    const student = a.students;
    // A quiz attempt can outlive its student row (e.g. the student record
    // was later removed) — skip anything we can no longer attribute.
    if (!student || !student.id) return;

    if (!byStudent.has(student.id)) {
      byStudent.set(student.id, {
        studentId: student.id,
        name: student.name,
        registerNumber: student.register_number,
        department: student.department,
        year: student.year,
        section: student.section,
        isGuest: !student.username,
        attemptsCount: 0,
        percentageSum: 0,
        lastSubmittedAt: null,
      });
    }

    const entry = byStudent.get(student.id);
    entry.attemptsCount += 1;
    entry.percentageSum += Number(a.percentage) || 0;
    if (!entry.lastSubmittedAt || (a.submitted_at && a.submitted_at > entry.lastSubmittedAt)) {
      entry.lastSubmittedAt = a.submitted_at;
    }
  });

  const rows = [...byStudent.values()].map((e) => ({
    studentId: e.studentId,
    name: e.name,
    registerNumber: e.registerNumber,
    department: e.department,
    year: e.year,
    section: e.section,
    quizzesAttended: e.attemptsCount,
    cumulativePercentage: e.attemptsCount ? Math.round((e.percentageSum / e.attemptsCount) * 100) / 100 : 0,
    lastSubmittedAt: e.lastSubmittedAt,
  }));

  // Highest cumulative percentage first; more quizzes attended breaks a tie
  // (a 90% average over 5 quizzes edges out a 90% average over 1), then name.
  const rank = (list) =>
    [...list]
      .sort(
        (a, b) =>
          b.cumulativePercentage - a.cumulativePercentage ||
          b.quizzesAttended - a.quizzesAttended ||
          String(a.name || "").localeCompare(String(b.name || ""))
      )
      .map((row, i) => ({ ...row, rank: i + 1 }));

  const registeredIds = new Set(
    [...byStudent.values()].filter((e) => !e.isGuest).map((e) => e.studentId)
  );

  res.json({
    success: true,
    leaderboard: rank(rows.filter((r) => registeredIds.has(r.studentId))),
    guests: rank(rows.filter((r) => !registeredIds.has(r.studentId))),
  });
});

module.exports = { getLeaderboard };
