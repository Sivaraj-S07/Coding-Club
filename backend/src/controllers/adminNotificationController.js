const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { notificationReadsSupported } = require("../utils/featureSupport");

// Read state is stored per notification id in `admin_notification_reads`
// (see backend/sql/schema.sql). If that table hasn't been created yet the API
// keeps working with an in-memory fallback for the life of the process, so the
// red unread dot still behaves correctly during the session.
const memoryReads = new Set();
const ADMIN_KEY = "admin";

async function loadReadIds() {
  if (!(await notificationReadsSupported())) return memoryReads;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("admin_notification_reads")
    .select("notification_id")
    .eq("admin_key", ADMIN_KEY);
  if (error) return memoryReads;
  return new Set((data || []).map((r) => r.notification_id));
}

async function persistReadIds(ids) {
  const clean = [...new Set(ids.map((id) => String(id)).filter(Boolean))].slice(0, 200);
  if (!clean.length) return 0;
  clean.forEach((id) => memoryReads.add(id));
  if (!(await notificationReadsSupported())) return clean.length;
  const supabase = getSupabase();
  const { error } = await supabase.from("admin_notification_reads").upsert(
    clean.map((id) => ({
      admin_key: ADMIN_KEY,
      notification_id: id,
      read_at: new Date().toISOString(),
    })),
    { onConflict: "admin_key,notification_id" }
  );
  if (error) throw new ApiError(500, "Failed to mark notifications as read", error.message);
  return clean.length;
}

// Builds the notification feed out of recent activity. Every entry has a
// stable id, so read state persists across refreshes.
async function buildEvents() {
  const supabase = getSupabase();
  const [{ data: recentAttempts, error: attemptsError }, { data: recentQuizzes, error: quizzesError }] =
    await Promise.all([
      supabase
        .from("quiz_attempts")
        .select("id, percentage, passed, submitted_at, quizzes(title), students(name)")
        .in("status", ["submitted", "auto_submitted"])
        .order("submitted_at", { ascending: false })
        .limit(25),
      supabase
        .from("quizzes")
        .select("id, title, status, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

  if (attemptsError || quizzesError) {
    throw new ApiError(500, "Failed to load notifications", (attemptsError || quizzesError).message);
  }

  const events = [];

  (recentAttempts || []).forEach((a) => {
    if (!a.submitted_at) return;
    const pct = Math.round(Number(a.percentage) || 0);
    events.push({
      id: `attempt-${a.id}`,
      type: "submission",
      message: `${a.students?.name || "A student"} submitted "${a.quizzes?.title || "a quiz"}" — ${pct}%${
        a.passed ? "" : " (below passing)"
      }`,
      timestamp: a.submitted_at,
    });
  });

  (recentQuizzes || []).forEach((q) => {
    events.push({
      id: `quiz-${q.id}`,
      type: "quiz",
      message: `Quiz "${q.title}" was created (${q.status})`,
      timestamp: q.created_at,
    });
  });

  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return events.slice(0, 30);
}

// GET /api/admin/notifications
const listNotifications = asyncHandler(async (req, res) => {
  const [events, readIds] = await Promise.all([buildEvents(), loadReadIds()]);
  const notifications = events.map((e) => ({ ...e, read: readIds.has(e.id) }));
  res.json({
    success: true,
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
  });
});

// POST /api/admin/notifications/read  { ids: [...] }
const markRead = asyncHandler(async (req, res) => {
  const ids = Array.isArray((req.body || {}).ids) ? req.body.ids : [];
  if (!ids.length) throw new ApiError(400, "ids must be a non-empty array");
  await persistReadIds(ids);
  const [events, readIds] = await Promise.all([buildEvents(), loadReadIds()]);
  res.json({
    success: true,
    unreadCount: events.filter((e) => !readIds.has(e.id)).length,
  });
});

// POST /api/admin/notifications/read-all
const markAllRead = asyncHandler(async (req, res) => {
  const events = await buildEvents();
  await persistReadIds(events.map((e) => e.id));
  res.json({ success: true, unreadCount: 0 });
});

module.exports = { listNotifications, markRead, markAllRead };
