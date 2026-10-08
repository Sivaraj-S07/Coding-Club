const crypto = require("crypto");
const path = require("path");
const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const env = require("../config/env");

const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
const ALLOWED_VIDEO_MIME = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];

function mediaTypeFromMime(mime) {
  if (ALLOWED_IMAGE_MIME.includes(mime)) return "image";
  if (ALLOWED_VIDEO_MIME.includes(mime)) return "video";
  return null;
}

// Bucket creation only needs to happen once per server process — cache the
// result instead of round-tripping to Supabase on every single upload.
let bucketReady = false;
async function ensureBucket(supabase) {
  if (bucketReady) return;
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (!listError && Array.isArray(buckets) && buckets.some((b) => b.name === env.LANDING_MEDIA_BUCKET)) {
    bucketReady = true;
    return;
  }
  // Public bucket: the Landing Page is public and unauthenticated, so
  // images/videos need to be fetchable directly by URL without proxying
  // every byte (especially video) through this API.
  const { error: createError } = await supabase.storage.createBucket(env.LANDING_MEDIA_BUCKET, { public: true });
  // Ignore "already exists" — a concurrent request or a stale listBuckets()
  // result can both land here even though the bucket is actually fine.
  if (createError && !/already exists/i.test(createError.message || "")) {
    throw new ApiError(500, "Failed to prepare media storage bucket", createError.message);
  }
  bucketReady = true;
}

function toPublicMedia(row) {
  return {
    id: row.id,
    type: row.media_type,
    title: row.title,
    caption: row.caption,
    url: row.url,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

// GET /api/admin/media — every item (active and inactive), for the Admin
// Portal's own management grid.
const listMedia = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("landing_media")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new ApiError(500, "Failed to load landing media", error.message);
  res.json({ success: true, media: (data || []).map(toPublicMedia) });
});

// POST /api/admin/media — multipart/form-data: file (required), title?, caption?
const uploadMedia = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, "No file uploaded");

  const mediaType = mediaTypeFromMime(file.mimetype);
  if (!mediaType) {
    throw new ApiError(
      400,
      "Unsupported file type. Upload an image (PNG, JPEG, WEBP, GIF) or a video (MP4, WEBM, OGG, MOV)."
    );
  }

  const maxMb = mediaType === "image" ? env.LANDING_MEDIA_IMAGE_MAX_MB : env.LANDING_MEDIA_VIDEO_MAX_MB;
  if (file.size > maxMb * 1024 * 1024) {
    throw new ApiError(413, `File too large. The limit for ${mediaType}s is ${maxMb}MB.`);
  }

  const supabase = getSupabase();
  await ensureBucket(supabase);

  const ext = (path.extname(file.originalname || "") || "").slice(0, 10);
  const storagePath = `${mediaType}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(env.LANDING_MEDIA_BUCKET)
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (uploadError) throw new ApiError(500, "Failed to upload file to storage", uploadError.message);

  const { data: publicUrlData } = supabase.storage.from(env.LANDING_MEDIA_BUCKET).getPublicUrl(storagePath);
  const url = publicUrlData?.publicUrl;
  if (!url) {
    await supabase.storage.from(env.LANDING_MEDIA_BUCKET).remove([storagePath]).catch(() => {});
    throw new ApiError(500, "Failed to resolve a public URL for the uploaded file");
  }

  // New items go to the end of the gallery by default.
  const { count } = await supabase.from("landing_media").select("id", { count: "exact", head: true });

  const title = String(req.body?.title || "").trim().slice(0, 200) || null;
  const caption = String(req.body?.caption || "").trim().slice(0, 500) || null;

  const { data: row, error: insertError } = await supabase
    .from("landing_media")
    .insert({
      media_type: mediaType,
      title,
      caption,
      storage_path: storagePath,
      url,
      mime_type: file.mimetype,
      file_size_bytes: file.size,
      sort_order: typeof count === "number" ? count : 0,
      is_active: true,
    })
    .select("*")
    .single();
  if (insertError) {
    // Don't leave an orphaned file in storage if the DB write failed.
    await supabase.storage.from(env.LANDING_MEDIA_BUCKET).remove([storagePath]).catch(() => {});
    throw new ApiError(500, "Failed to save media record", insertError.message);
  }

  res.status(201).json({ success: true, media: toPublicMedia(row) });
});

// PATCH /api/admin/media/:id — { title?, caption?, isActive? }
const updateMedia = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const body = req.body || {};
  const updates = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) updates.title = String(body.title || "").trim().slice(0, 200) || null;
  if (body.caption !== undefined) updates.caption = String(body.caption || "").trim().slice(0, 500) || null;
  if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive);

  const { data, error } = await supabase
    .from("landing_media")
    .update(updates)
    .eq("id", req.params.id)
    .select("*")
    .maybeSingle();
  if (error) throw new ApiError(500, "Failed to update media item", error.message);
  if (!data) throw new ApiError(404, "Media item not found");
  res.json({ success: true, media: toPublicMedia(data) });
});

// PUT /api/admin/media/reorder — { orderedIds: [...] }, same pattern as
// adminQuestionController.reorderQuestions.
const reorderMedia = asyncHandler(async (req, res) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new ApiError(400, "orderedIds must be a non-empty array of media ids");
  }
  const supabase = getSupabase();
  await Promise.all(
    orderedIds.map((id, idx) => supabase.from("landing_media").update({ sort_order: idx }).eq("id", id))
  );
  res.json({ success: true, message: "Media order updated" });
});

// DELETE /api/admin/media/:id
const deleteMedia = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { data: row, error: fetchError } = await supabase
    .from("landing_media")
    .select("id, storage_path")
    .eq("id", req.params.id)
    .maybeSingle();
  if (fetchError) throw new ApiError(500, "Failed to load media item", fetchError.message);
  if (!row) throw new ApiError(404, "Media item not found");

  const { error: deleteError } = await supabase.from("landing_media").delete().eq("id", req.params.id);
  if (deleteError) throw new ApiError(500, "Failed to delete media item", deleteError.message);

  // Best-effort cleanup — the DB row is already gone either way, so a
  // storage hiccup here shouldn't surface as a failed delete to the admin.
  await supabase.storage.from(env.LANDING_MEDIA_BUCKET).remove([row.storage_path]).catch(() => {});

  res.json({ success: true, message: "Media item deleted" });
});

module.exports = { listMedia, uploadMedia, updateMedia, reorderMedia, deleteMedia };
