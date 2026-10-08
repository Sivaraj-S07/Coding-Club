const bcrypt = require("bcryptjs");
const { getSupabase } = require("../config/supabaseClient");
const { signStudentToken } = require("../utils/jwt");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { passwordIssues } = require("../utils/passwordPolicy");
const {
  normalizeDepartment,
  normalizeSection,
  isValidBatch,
  normalizeMobileNumber,
  normalizeEmail,
} = require("../utils/enums");

const clean = (v) => String(v ?? "").trim();

const USERNAME_RE = /^[A-Za-z0-9._-]{3,30}$/;
const REGISTER_NUMBER_RE = /^[0-9]{12}$/;

// Detect "these new columns don't exist yet" so a deployment that hasn't run
// migration_student_accounts.sql gets a clear, actionable error instead of a
// generic 500.
function isMissingAccountColumns(error) {
  const text = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    /username/.test(text) || /password_hash/.test(text) || /account_created_at/.test(text)
  ) && (text.includes("does not exist") || text.includes("could not find") || text.includes("schema cache"));
}

function accountSetupError() {
  return new ApiError(
    500,
    "Student accounts aren't set up in this database yet. In Supabase, run backend/sql/migration_student_accounts.sql (it's also included in schema.sql for new databases)."
  );
}

// Detect "register_number is still NOT NULL" — the database hasn't run
// migration_email_signup.sql yet, so a fresh Sign Up (which intentionally
// no longer collects a register number) is rejected by the old constraint.
function isRegisterNumberNotNullable(error) {
  const text = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return /register_number/.test(text) && /not-null|not null/.test(text);
}

function emailSignupSetupError() {
  return new ApiError(
    500,
    "This database hasn't been updated for email Sign Up yet. In Supabase, run backend/sql/migration_email_signup.sql (it's also included in schema.sql for new databases)."
  );
}

const PROFILE_COLUMNS = ["bio", "avatar_url", "batch", "mobile_number"];

// Profile columns (bio, avatar_url, batch, mobile_number) are newer and
// optional — a database that hasn't run migration_student_profile.sql /
// migration_student_mobile.sql yet must NOT lose Sign In or the Dashboard
// over it. Every read that includes these columns retries once without them
// so existing functionality keeps working unchanged; Profile editing itself
// (updateAccount) and Sign Up's Batch/Mobile Number fields still surface a
// clear setup error, since those genuinely cannot work until the migrations
// are run.
function isMissingProfileColumns(error) {
  const text = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    PROFILE_COLUMNS.some((c) => new RegExp(`\\b${c}\\b`).test(text)) &&
    (text.includes("does not exist") || text.includes("could not find") || text.includes("schema cache"))
  );
}

function profileSetupError() {
  return new ApiError(
    500,
    "Profile fields aren't set up in this database yet. In Supabase, run backend/sql/migration_student_profile.sql and backend/sql/migration_student_mobile.sql (both are also included in schema.sql for new databases)."
  );
}

async function selectStudentWithProfileFallback(supabase, columns, matchColumn, matchValue) {
  let { data, error } = await supabase.from("students").select(columns).eq(matchColumn, matchValue).maybeSingle();
  if (error && isMissingProfileColumns(error)) {
    const fallbackColumns = columns
      .split(",")
      .map((c) => c.trim())
      .filter((c) => !PROFILE_COLUMNS.includes(c))
      .join(", ");
    ({ data, error } = await supabase.from("students").select(fallbackColumns).eq(matchColumn, matchValue).maybeSingle());
    if (!error && data) {
      PROFILE_COLUMNS.forEach((c) => {
        data[c] = null;
      });
    }
  }
  return { data, error };
}

// A profile is "complete" once the two fields Sign Up no longer collects up
// front — Register Number and Mobile Number — have been filled in. Until
// then, StudentAccountProtectedRoute on the frontend forces the student back
// to /profile before they can reach the Dashboard or anywhere else.
function isProfileComplete(student) {
  return Boolean(student?.register_number) && Boolean(student?.mobile_number);
}

function toStudentPayload(student) {
  return {
    id: student.id,
    name: student.name,
    username: student.username,
    registerNumber: student.register_number,
    email: student.email,
    department: student.department || "",
    section: student.section || "",
    batch: student.batch || "",
    mobileNumber: student.mobile_number || "",
    bio: student.bio || "",
    avatarUrl: student.avatar_url || "",
    profileComplete: isProfileComplete(student),
  };
}

// POST /api/students/register — Sign Up: Username, Email, Password, Confirm
// Password ONLY. Everything else (Register Number, Mobile Number,
// Department, Section, Batch) is collected afterwards, during forced Profile
// completion — see updateAccount below.
const registerAccount = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const username = clean(body.username);
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const confirmPassword = body.confirmPassword !== undefined ? String(body.confirmPassword) : null;

  const errors = [];
  if (!username) {
    errors.push("Username is required");
  } else if (!USERNAME_RE.test(username)) {
    errors.push("Username must be 3-30 characters: letters, numbers, dots, underscores or hyphens only");
  }
  if (!clean(body.email)) {
    errors.push("Email is required");
  } else if (!email) {
    errors.push("Please enter a valid email address");
  }
  const weakness = passwordIssues(password);
  if (weakness.length) {
    errors.push(`Password must contain ${weakness.join(", ")}`);
  }
  if (confirmPassword !== null && confirmPassword !== password) {
    errors.push("Passwords do not match");
  }
  if (errors.length) throw new ApiError(400, "Validation failed", errors);

  const supabase = getSupabase();

  // Username must be globally unique among accounts that have one.
  const { data: usernameTaken, error: usernameError } = await supabase
    .from("students")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (usernameError) {
    if (isMissingAccountColumns(usernameError)) throw accountSetupError();
    throw new ApiError(500, "Failed to check username availability", usernameError.message);
  }
  if (usernameTaken) throw new ApiError(409, "That username is already taken");

  // Email must be unique among accounts (rows that actually have a
  // password) — guest/quiz-only rows created before this feature existed
  // may share or lack an email and are not part of this check.
  const { data: emailTaken, error: emailError } = await supabase
    .from("students")
    .select("id")
    .eq("email", email)
    .not("password_hash", "is", null)
    .maybeSingle();
  if (emailError) {
    if (isMissingAccountColumns(emailError)) throw accountSetupError();
    throw new ApiError(500, "Failed to check email availability", emailError.message);
  }
  if (emailTaken) throw new ApiError(409, "An account already exists for this email. Try signing in instead.");

  const passwordHash = bcrypt.hashSync(password, 10);
  const selectColumns =
    "id, name, username, register_number, email, department, section, batch, mobile_number, bio, avatar_url";

  const { data: created, error: createError } = await supabase
    .from("students")
    .insert({
      name: username,
      username,
      email,
      password_hash: passwordHash,
      account_created_at: new Date().toISOString(),
    })
    .select(selectColumns)
    .single();
  if (createError) {
    if (isRegisterNumberNotNullable(createError)) throw emailSignupSetupError();
    if (isMissingProfileColumns(createError)) throw profileSetupError();
    if (isMissingAccountColumns(createError)) throw accountSetupError();
    if (/duplicate key/i.test(createError.message || "") && /email/i.test(createError.message || "")) {
      throw new ApiError(409, "An account already exists for this email. Try signing in instead.");
    }
    if (/duplicate key/i.test(createError.message || "") && /username/i.test(createError.message || "")) {
      throw new ApiError(409, "That username is already taken");
    }
    throw new ApiError(500, "Failed to create account", createError.message);
  }

  const token = signStudentToken({
    studentId: created.id,
    registerNumber: created.register_number,
    account: true,
  });

  res.status(201).json({ success: true, token, student: toStudentPayload(created) });
});

// POST /api/students/signin — Sign In: Email + Password -> Dashboard (or,
// while the profile is incomplete, forced back to /profile first).
const signIn = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");

  if (!email || !password) {
    throw new ApiError(400, "A valid email and password are required");
  }

  const supabase = getSupabase();
  const columns =
    "id, name, username, register_number, password_hash, email, department, section, bio, avatar_url, batch, mobile_number, account_created_at";
  let { data: rows, error } = await supabase
    .from("students")
    .select(columns)
    .eq("email", email)
    .not("password_hash", "is", null)
    .order("account_created_at", { ascending: true })
    .limit(1);
  if (error && isMissingProfileColumns(error)) {
    const fallbackColumns = columns
      .split(",")
      .map((c) => c.trim())
      .filter((c) => !PROFILE_COLUMNS.includes(c));
    ({ data: rows, error } = await supabase
      .from("students")
      .select(fallbackColumns.join(", "))
      .eq("email", email)
      .not("password_hash", "is", null)
      .order("account_created_at", { ascending: true })
      .limit(1));
    if (!error && rows) {
      rows = rows.map((r) => {
        PROFILE_COLUMNS.forEach((c) => {
          r[c] = null;
        });
        return r;
      });
    }
  }
  if (error) {
    if (isMissingAccountColumns(error)) throw accountSetupError();
    throw new ApiError(500, "Failed to sign in", error.message);
  }

  const student = rows && rows[0];

  // Same generic message whether the email is unknown or the password is
  // wrong — never reveal which one it was.
  if (!student || !student.password_hash || !bcrypt.compareSync(password, student.password_hash)) {
    throw new ApiError(401, "Incorrect email or password");
  }

  const token = signStudentToken({
    studentId: student.id,
    registerNumber: student.register_number,
    account: true,
  });

  res.json({ success: true, token, student: toStudentPayload(student) });
});

// GET /api/students/account — resolve the current account session (used by
// the Dashboard). Distinct from getProfile (which is used mid-quiz).
const getAccount = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { data: student, error } = await selectStudentWithProfileFallback(
    supabase,
    "id, name, username, register_number, email, department, section, bio, avatar_url, batch, mobile_number",
    "id",
    req.student.studentId
  );
  if (error) throw new ApiError(500, "Failed to load account", error.message);
  if (!student) throw new ApiError(404, "Account not found");
  res.json({ success: true, student: toStudentPayload(student) });
});

const BIO_MAX_LENGTH = 300;
// Data URL avatar, base64-encoded — cap the decoded payload at ~1.5MB so a
// student can't push an oversized image into the database. The frontend
// resizes images before upload, so a legitimate photo is far smaller.
const AVATAR_MAX_BYTES = 1.5 * 1024 * 1024;
const AVATAR_DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/;

// Tables that carry a student_id foreign key into `students`. Used only when
// completing Profile links a brand-new account to an existing register
// number that already has quiz history under a different row (see the
// register number handling in updateAccount below).
const STUDENT_FK_TABLES = ["quiz_attempts", "student_logout_events", "attendance"];

// PUT /api/students/account — update the signed-in student's own profile.
// This is also where forced Profile completion happens: Register Number and
// Mobile Number are only ever collected here (never at Sign Up), and
// Register Number can be set exactly once — after that it is immutable,
// same as before.
const updateAccount = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const supabase = getSupabase();
  const updates = { updated_at: new Date().toISOString() };
  const errors = [];
  let mergeFromId = null;

  if (body.username !== undefined) {
    const username = clean(body.username);
    if (!username) {
      errors.push("Username is required");
    } else if (!USERNAME_RE.test(username)) {
      errors.push("Username must be 3-30 characters: letters, numbers, dots, underscores or hyphens only");
    } else {
      const { data: taken, error: usernameError } = await supabase
        .from("students")
        .select("id")
        .ilike("username", username)
        .neq("id", req.student.studentId)
        .maybeSingle();
      if (usernameError) {
        if (isMissingAccountColumns(usernameError)) throw accountSetupError();
        throw new ApiError(500, "Failed to check username availability", usernameError.message);
      }
      if (taken) errors.push("That username is already taken");
      else updates.username = username;
    }
  }

  if (body.bio !== undefined) {
    const bio = String(body.bio ?? "").trim();
    if (bio.length > BIO_MAX_LENGTH) {
      errors.push(`Bio must be ${BIO_MAX_LENGTH} characters or fewer`);
    } else {
      updates.bio = bio;
    }
  }

  if (body.avatarUrl !== undefined) {
    const avatarUrl = String(body.avatarUrl ?? "").trim();
    if (!avatarUrl) {
      // Explicit empty string removes the photo.
      updates.avatar_url = null;
    } else {
      const match = AVATAR_DATA_URL_RE.exec(avatarUrl);
      if (!match) {
        errors.push("Photo must be a PNG, JPEG, WEBP or GIF image");
      } else {
        // Rough decoded-size check straight from the base64 string, no need
        // to actually decode it.
        const approxBytes = Math.ceil((match[2].length * 3) / 4);
        if (approxBytes > AVATAR_MAX_BYTES) {
          errors.push("Photo is too large — please use a smaller image");
        } else {
          updates.avatar_url = avatarUrl;
        }
      }
    }
  }

  if (body.department !== undefined) {
    const raw = clean(body.department);
    if (raw) {
      // Optional here — a student can complete their profile in stages —
      // but if a value IS given, it must be one of the real options.
      const department = normalizeDepartment(raw);
      if (!department) errors.push("Please select a valid department");
      else updates.department = department;
    }
  }

  if (body.section !== undefined) {
    const raw = clean(body.section);
    if (raw) {
      const section = normalizeSection(raw);
      if (!section) errors.push("Please select a valid section");
      else updates.section = section;
    }
  }

  if (body.batch !== undefined) {
    const batch = clean(body.batch);
    if (batch) {
      if (!isValidBatch(batch)) {
        errors.push("Please select a valid batch (pick a start year, then an end year)");
      } else {
        updates.batch = batch;
      }
    }
  }

  if (body.mobileNumber !== undefined) {
    const raw = clean(body.mobileNumber);
    if (raw) {
      const mobileNumber = normalizeMobileNumber(raw);
      if (!mobileNumber) errors.push("Please enter a valid 10-digit mobile number");
      else updates.mobile_number = mobileNumber;
    }
  }

  // Register Number: collected once, during Profile completion. Settable
  // only while it is still empty — once saved it is permanently fixed,
  // exactly like before this feature existed.
  if (body.registerNumber !== undefined) {
    const registerNumber = clean(body.registerNumber);
    if (!registerNumber) {
      errors.push("Register number is required");
    } else if (!REGISTER_NUMBER_RE.test(registerNumber)) {
      errors.push("Register number must be exactly 12 digits");
    } else {
      const { data: current, error: currentError } = await supabase
        .from("students")
        .select("register_number")
        .eq("id", req.student.studentId)
        .maybeSingle();
      if (currentError) throw new ApiError(500, "Failed to check your account", currentError.message);
      if (current?.register_number) {
        errors.push("Register number is already set and cannot be changed");
      } else {
        const { data: holder, error: holderError } = await supabase
          .from("students")
          .select("id, password_hash")
          .eq("register_number", registerNumber)
          .maybeSingle();
        if (holderError) {
          if (isRegisterNumberNotNullable(holderError)) throw emailSignupSetupError();
          throw new ApiError(500, "Failed to verify register number", holderError.message);
        }
        if (holder && holder.id !== req.student.studentId) {
          if (holder.password_hash) {
            // Another real account already owns this register number.
            errors.push("That register number is already linked to another account");
          } else {
            // A guest row created by joining a quiz before this account
            // existed — fold its history into this account instead of
            // rejecting the register number outright.
            mergeFromId = holder.id;
          }
        }
        if (!errors.length) updates.register_number = registerNumber;
      }
    }
  }

  if (errors.length) throw new ApiError(400, "Validation failed", errors);
  if (Object.keys(updates).length === 1) {
    // Only updated_at present — nothing was actually submitted to change.
    throw new ApiError(400, "Nothing to update");
  }

  // Best-effort merge: reassign the old guest row's quiz history to this
  // account, then remove the now-empty duplicate row, BEFORE writing the
  // new register number (so the partial-unique index never briefly holds
  // the same register number twice).
  if (mergeFromId) {
    for (const table of STUDENT_FK_TABLES) {
      // eslint-disable-next-line no-await-in-loop
      const { error: reassignError } = await supabase
        .from(table)
        .update({ student_id: req.student.studentId })
        .eq("student_id", mergeFromId);
      if (reassignError) {
        throw new ApiError(
          500,
          "Failed to merge your previous quiz history into this account",
          reassignError.message
        );
      }
    }
    const { error: deleteError } = await supabase.from("students").delete().eq("id", mergeFromId);
    if (deleteError) {
      throw new ApiError(500, "Failed to finish linking your register number", deleteError.message);
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("students")
    .update(updates)
    .eq("id", req.student.studentId)
    .select("id, name, username, register_number, email, department, section, bio, avatar_url, batch, mobile_number")
    .single();
  if (updateError) {
    if (isRegisterNumberNotNullable(updateError)) throw emailSignupSetupError();
    if (isMissingProfileColumns(updateError)) throw profileSetupError();
    if (isMissingAccountColumns(updateError)) throw accountSetupError();
    if (/duplicate key/i.test(updateError.message || "") && /register_number/i.test(updateError.message || "")) {
      throw new ApiError(409, "That register number is already linked to another account");
    }
    if (/duplicate key/i.test(updateError.message || "")) {
      throw new ApiError(409, "That username is already taken");
    }
    throw new ApiError(500, "Failed to update profile", updateError.message);
  }

  res.json({ success: true, student: toStudentPayload(updated) });
});

// PUT /api/students/account/password — change the signed-in student's
// password. Requires the current password so a hijacked/idle session can't
// silently lock the real owner out.
const changePassword = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  const confirmPassword = body.confirmPassword !== undefined ? String(body.confirmPassword) : null;

  const errors = [];
  if (!currentPassword) errors.push("Current password is required");
  const weakness = passwordIssues(newPassword);
  if (weakness.length) errors.push(`New password must contain ${weakness.join(", ")}`);
  if (confirmPassword !== null && confirmPassword !== newPassword) {
    errors.push("New passwords do not match");
  }
  if (errors.length) throw new ApiError(400, "Validation failed", errors);

  const supabase = getSupabase();
  const { data: student, error } = await supabase
    .from("students")
    .select("id, password_hash")
    .eq("id", req.student.studentId)
    .maybeSingle();
  if (error) throw new ApiError(500, "Failed to change password", error.message);
  if (!student || !student.password_hash) throw new ApiError(404, "Account not found");

  if (!bcrypt.compareSync(currentPassword, student.password_hash)) {
    throw new ApiError(401, "Current password is incorrect");
  }
  if (bcrypt.compareSync(newPassword, student.password_hash)) {
    throw new ApiError(400, "New password must be different from your current password");
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  const { error: updateError } = await supabase
    .from("students")
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq("id", student.id);
  if (updateError) throw new ApiError(500, "Failed to change password", updateError.message);

  res.json({ success: true, message: "Password updated" });
});

// GET /api/students/account/logout-events — most recent forced-logout
// records for the signed-in account (e.g. a quiz attempt auto-submitted and
// signed out after too many proctoring violations), shown on the Dashboard.
// Best-effort: a database that hasn't run migration_logout_events.sql yet
// simply shows no events instead of breaking the Dashboard.
const listLogoutEvents = asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("student_logout_events")
    .select("id, quiz_title, reason, message, created_at")
    .eq("student_id", req.student.studentId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) {
    return res.json({ success: true, events: [] });
  }
  res.json({
    success: true,
    events: (data || []).map((e) => ({
      id: e.id,
      quizTitle: e.quiz_title || "",
      reason: e.reason,
      message: e.message,
      createdAt: e.created_at,
    })),
  });
});

module.exports = { registerAccount, signIn, getAccount, updateAccount, changePassword, listLogoutEvents };
