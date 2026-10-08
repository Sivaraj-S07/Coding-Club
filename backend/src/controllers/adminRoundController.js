const { getSupabase } = require("../config/supabaseClient");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const {
  roundsSupported,
  resetRoundsSupportCache,
  roundQualificationSupported,
  roundUpdatedAtSupported,
} = require("../utils/featureSupport");

const MIGRATION_HINT =
  "Rounds are not enabled on this database yet. Run backend/sql/schema.sql in the Supabase SQL editor to create the `rounds` table and the `questions.round_id` column.";

function roundShape(r, questionCount) {
  return {
    id: r.id,
    quizId: r.quiz_id,
    name: r.name,
    description: r.description || "",
    order: r.order_index,
    // Minimum % of this round a student must score to unlock the next round.
    // 0 = no gate.
    qualificationPercentage: Number(r.qualification_percentage || 0),
    questionCount: questionCount ?? 0,
  };
}

// Normalises the admin-entered qualification percentage to 0..100.
function parseQualification(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ApiError(400, "Qualification percentage must be a number");
  if (n < 0 || n > 100) throw new ApiError(400, "Qualification percentage must be between 0 and 100");
  return Math.round(n * 100) / 100;
}

async function assertSupported() {
  if (!(await roundsSupported())) throw new ApiError(409, MIGRATION_HINT);
}

// GET /api/admin/quizzes/:quizId/rounds
const listRounds = asyncHandler(async (req, res) => {
  if (!(await roundsSupported())) {
    // Degrade gracefully: the builder simply shows the "no rounds" state.
    return res.json({ success: true, rounds: [], supported: false, message: MIGRATION_HINT });
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("quiz_id", req.params.quizId)
    .order("order_index", { ascending: true });
  if (error) throw new ApiError(500, "Failed to load rounds", error.message);

  const { data: questions, error: qError } = await supabase
    .from("questions")
    .select("id, round_id")
    .eq("quiz_id", req.params.quizId);
  if (qError) throw new ApiError(500, "Failed to load rounds", qError.message);

  const counts = new Map();
  (questions || []).forEach((q) => {
    if (!q.round_id) return;
    counts.set(q.round_id, (counts.get(q.round_id) || 0) + 1);
  });

  res.json({
    success: true,
    supported: true,
    // false => `rounds.qualification_percentage` is missing on this database.
    qualificationSupported: await roundQualificationSupported(),
    rounds: (data || []).map((r) => roundShape(r, counts.get(r.id) || 0)),
  });
});

// POST /api/admin/quizzes/:quizId/rounds
const createRound = asyncHandler(async (req, res) => {
  await assertSupported();
  const { name, description, qualificationPercentage } = req.body || {};
  if (!name || !String(name).trim()) throw new ApiError(400, "Round name is required");
  const qualification =
    qualificationPercentage === undefined || qualificationPercentage === null || qualificationPercentage === ""
      ? 0
      : parseQualification(qualificationPercentage);
  const supportsQualification = await roundQualificationSupported();

  const supabase = getSupabase();
  const { count, error: countError } = await supabase
    .from("rounds")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", req.params.quizId);
  if (countError) throw new ApiError(500, "Failed to create round", countError.message);

  const { data, error } = await supabase
    .from("rounds")
    .insert({
      quiz_id: req.params.quizId,
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      order_index: count || 0,
      ...(supportsQualification ? { qualification_percentage: qualification } : {}),
    })
    .select("*")
    .single();
  if (error) {
    resetRoundsSupportCache();
    throw new ApiError(500, "Failed to create round", error.message);
  }
  res.status(201).json({ success: true, round: roundShape(data, 0) });
});

// PUT /api/admin/rounds/:id
//
// Older databases may be missing `rounds.updated_at` and/or
// `rounds.qualification_percentage`. Writing to a column that doesn't exist
// makes Postgres reject the whole UPDATE (error 42703), which is why editing a
// round used to fail with "Failed to update round". We only write columns the
// database actually has, and if a write still trips 42703 we drop the offending
// column and retry once so the rest of the edit is saved.
const updateRound = asyncHandler(async (req, res) => {
  await assertSupported();
  const { name, description, qualificationPercentage } = req.body || {};
  const fields = {};
  let qualificationIgnored = false;

  if (qualificationPercentage !== undefined) {
    const value =
      qualificationPercentage === null || qualificationPercentage === ""
        ? 0
        : parseQualification(qualificationPercentage);
    if (await roundQualificationSupported()) fields.qualification_percentage = value;
    else qualificationIgnored = true;
  }
  if (name !== undefined) {
    if (!String(name).trim()) throw new ApiError(400, "Round name is required");
    fields.name = String(name).trim();
  }
  if (description !== undefined) fields.description = description ? String(description).trim() : null;
  if (!Object.keys(fields).length && !qualificationIgnored) {
    throw new ApiError(400, "Nothing to update");
  }
  if (await roundUpdatedAtSupported()) fields.updated_at = new Date().toISOString();

  const supabase = getSupabase();

  const runUpdate = (payload) =>
    supabase.from("rounds").update(payload).eq("id", req.params.id).select("*").maybeSingle();

  let { data, error } = await runUpdate(fields);

  // Undefined-column fallback: strip whatever column the DB rejected and retry.
  if (error && error.code === "42703") {
    resetRoundsSupportCache();
    const retry = { ...fields };
    delete retry.updated_at;
    if (/qualification_percentage/.test(error.message || "")) {
      delete retry.qualification_percentage;
      qualificationIgnored = true;
    }
    if (Object.keys(retry).length) {
      ({ data, error } = await runUpdate(retry));
    } else {
      error = null;
      const existing = await supabase.from("rounds").select("*").eq("id", req.params.id).maybeSingle();
      data = existing.data;
    }
  }

  if (error) throw new ApiError(500, "Failed to update round", error.message);
  if (!data) throw new ApiError(404, "Round not found");

  const { count } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("round_id", req.params.id);

  res.json({
    success: true,
    round: roundShape(data, count || 0),
    ...(qualificationIgnored
      ? {
          warning:
            "Round saved, but the qualification percentage could not be stored: run backend/sql/migration_rounds_and_notifications.sql to add the `rounds.qualification_percentage` column.",
        }
      : {}),
  });
});

// DELETE /api/admin/rounds/:id
// Questions inside the round are kept (round_id is set to null by the FK's
// ON DELETE SET NULL) so deleting a round never destroys question content.
const deleteRound = asyncHandler(async (req, res) => {
  await assertSupported();
  const supabase = getSupabase();
  const { error } = await supabase.from("rounds").delete().eq("id", req.params.id);
  if (error) throw new ApiError(500, "Failed to delete round", error.message);
  res.json({ success: true, message: "Round deleted. Its questions moved to Unassigned." });
});

// PUT /api/admin/quizzes/:quizId/rounds/reorder
const reorderRounds = asyncHandler(async (req, res) => {
  await assertSupported();
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds) || !orderedIds.length) {
    throw new ApiError(400, "orderedIds must be a non-empty array of round ids");
  }
  const supabase = getSupabase();
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from("rounds").update({ order_index: idx }).eq("id", id).eq("quiz_id", req.params.quizId)
    )
  );
  res.json({ success: true, message: "Round order updated" });
});

module.exports = { listRounds, createRound, updateRound, deleteRound, reorderRounds };
