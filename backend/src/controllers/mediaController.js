const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

// GET /api/media/landing — public, unauthenticated. Only active items, in
// admin-defined order, for the gallery section on the Landing Page.
const listLandingMedia = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("landing_media")
    .select("id, media_type, title, caption, url, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new ApiError(500, "Failed to load landing media", error.message);

  res.json({
    success: true,
    media: (data || []).map((row) => ({
      id: row.id,
      type: row.media_type,
      title: row.title,
      caption: row.caption,
      url: row.url,
    })),
  });
});

module.exports = { listLandingMedia };
