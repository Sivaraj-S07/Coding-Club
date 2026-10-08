const multer = require("multer");
const { ApiError } = require("../utils/asyncHandler");
const env = require("../config/env");

// Files are held in memory only long enough to stream them straight to
// Supabase Storage (see adminMediaController.uploadMedia) — nothing is ever
// written to this server's local disk, which matters on Render's ephemeral
// filesystem (a local file would vanish on the next deploy/restart anyway).
// The multer-level limit is generous (matches the larger of the two
// per-type caps); the controller re-checks the exact image/video limit
// afterward, since multer doesn't know which cap applies until it has
// already read the mimetype.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(env.LANDING_MEDIA_IMAGE_MAX_MB, env.LANDING_MEDIA_VIDEO_MAX_MB) * 1024 * 1024 },
});

const single = upload.single("file");

/**
 * Admin Portal -> Landing Media upload. Wraps multer's callback-style error
 * handling so failures (oversized file, malformed multipart body, etc.) flow
 * through the same asyncHandler -> errorHandler pipeline as every other
 * route instead of crashing the request with an unformatted error.
 */
function handleMediaUpload(req, res, next) {
  single(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return next(new ApiError(413, "File is too large."));
    }
    return next(new ApiError(400, err.message || "File upload failed."));
  });
}

module.exports = { handleMediaUpload };
