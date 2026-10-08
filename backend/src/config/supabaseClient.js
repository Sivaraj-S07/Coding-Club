const { createClient } = require("@supabase/supabase-js");
const env = require("./env");
const { ApiError } = require("../utils/asyncHandler");

let client = null;

/**
 * Server-side Supabase client using the SERVICE ROLE key.
 * This key must NEVER be sent to, or used from, the frontend.
 * All RLS policies are deny-by-default in schema.sql — only this
 * service-role client (used exclusively by this backend) can read/write.
 */
function getSupabase() {
  if (client) return client;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    // IMPORTANT: this must be an ApiError, not a plain Error. The global
    // error handler (middleware/errorHandler.js) only forwards the real
    // message for ApiErrors — a plain Error with no explicit statusCode is
    // treated as an unexpected 500 and gets replaced with a generic
    // "Internal server error", which used to hide this exact, actionable
    // message from the admin (every quiz/student/etc. action would just fail
    // with no clue why). Every route that calls getSupabase() is wrapped in
    // asyncHandler, so this throw is caught and forwarded correctly.
    throw new ApiError(
      500,
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env, then restart the server."
    );
  }

  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

module.exports = { getSupabase };
