const bcrypt = require("bcryptjs");
const env = require("../config/env");
const { getSupabase } = require("../config/supabaseClient");
const { signAdminToken } = require("../utils/jwt");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }
  const normalizedEmail = String(email).trim().toLowerCase();

  // 1) Fast path: the env-configured admin (works even before Supabase is set up).
  if (normalizedEmail === env.ADMIN_EMAIL) {
    const ok = bcrypt.compareSync(password, env.ADMIN_PASSWORD_HASH);
    if (ok) {
      const token = signAdminToken({ email: normalizedEmail, source: "env" });
      return res.json({
        success: true,
        token,
        admin: { email: normalizedEmail, name: "Administrator" },
      });
    }
  }

  // 2) Fall back to the admins table in Supabase, for additional admin accounts.
  try {
    const supabase = getSupabase();
    const { data: admin, error } = await supabase
      .from("admins")
      .select("id, email, password_hash, name")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (!error && admin && bcrypt.compareSync(password, admin.password_hash)) {
      const token = signAdminToken({ email: admin.email, id: admin.id });
      return res.json({
        success: true,
        token,
        admin: { email: admin.email, name: admin.name || "Administrator" },
      });
    }
  } catch (err) {
    // Supabase may not be configured yet — that's fine, env admin still works above.
  }

  throw new ApiError(401, "Invalid email or password");
});

module.exports = { login };
