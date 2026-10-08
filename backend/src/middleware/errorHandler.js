const { ApiError } = require("../utils/asyncHandler");

function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isApiError = err instanceof ApiError;
  const statusCode = isApiError ? err.statusCode : err.statusCode || 500;

  if (!isApiError) {
    // Unexpected error — log full detail server-side, keep client message generic.
    console.error("[unhandled error]", err);
  }

  res.status(statusCode).json({
    success: false,
    message: isApiError || statusCode < 500 ? err.message : "Internal server error",
    ...(isApiError && err.details ? { details: err.details } : {}),
  });
}

module.exports = { notFoundHandler, errorHandler };
