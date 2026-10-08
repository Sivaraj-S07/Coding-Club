const crypto = require("crypto");

// Minimal in-memory stand-in for the slice of supabase-js the AI learning code
// uses: select/insert/update/upsert/delete with eq/neq/in/is/gte filters,
// order/limit, maybeSingle/single and a couple of relation embeds.
const PRIMARY_KEYS = { learning_profiles: ["student_id"], topic_mastery: ["student_id", "topic_id"] };
const EMBEDS = {
  quiz_attempts: { quizzes: { table: "quizzes", fk: "quiz_id" } },
};

const ilikeRegex = (pattern) => new RegExp(`^${String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i");
const clone = (v) => (v === undefined ? v : structuredClone(v));

class Query {
  constructor(db, table) {
    Object.assign(this, { db, table, op: "select", filters: [], orders: [], limitN: null, cols: "*", payload: null, expect: null, returning: false, onConflict: null });
  }
  select(cols = "*") {
    if (this.op !== "select") this.returning = true;
    this.cols = cols;
    return this;
  }
  insert(rows) { this.op = "insert"; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows, opts = {}) { this.op = "upsert"; this.payload = Array.isArray(rows) ? rows : [rows]; this.onConflict = opts.onConflict; return this; }
  update(patch) { this.op = "update"; this.payload = patch; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
  in(c, vals) { this.filters.push((r) => vals.includes(r[c])); return this; }
  is(c, v) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  gte(c, v) { this.filters.push((r) => r[c] >= v); return this; }
  // Text filters used by Team Search (additive; existing helpers are unchanged).
  ilike(c, pattern) { const re = ilikeRegex(pattern); this.filters.push((r) => re.test(String(r[c] ?? ""))); return this; }
  not(c, op, v) { if (op === "is") this.filters.push((r) => (v === null ? r[c] != null : r[c] !== v)); return this; }
  or(expr) {
    const tests = String(expr).split(",").map((part) => { const [col, op, ...rest] = part.split("."); const re = ilikeRegex(rest.join(".")); return (r) => op === "ilike" && re.test(String(r[col] ?? "")); });
    this.filters.push((r) => tests.some((t) => t(r)));
    return this;
  }
  order(c, { ascending = true } = {}) { this.orders.push({ c, ascending }); return this; }
  limit(n) { this.limitN = n; return this; }
  maybeSingle() { this.expect = "maybeSingle"; return this; }
  single() { this.expect = "single"; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }

  fail(message, code = "XX000") { return { data: null, error: { message, code, details: "" } }; }

  embed(row) {
    const out = clone(row);
    const rel = EMBEDS[this.table];
    if (rel) {
      for (const [name, def] of Object.entries(rel)) {
        if (new RegExp(`${name}\\s*\\(`).test(this.cols)) out[name] = clone(this.db.rows[def.table].find((r) => r.id === row[def.fk]) || null);
      }
    }
    if (this.table === "questions" && /quiz_options\s*\(/.test(this.cols)) {
      out.quiz_options = this.db.rows.quiz_options.filter((o) => o.question_id === row.id).map(clone);
    }
    return out;
  }

  run() {
    const { db, table } = this;
    if (db.missing.includes(table)) return this.fail(`Could not find the table 'public.${table}' in the schema cache`, "PGRST205");
    if (!db.rows[table]) return this.fail(`relation "${table}" does not exist`, "42P01");
    const fail = db.failures.find((f) => f.table === table && f.op === this.op && f.remaining > 0);
    if (fail) { fail.remaining--; return this.fail(`simulated ${this.op} failure`); }

    const now = new Date().toISOString();
    if (this.op === "insert" || this.op === "upsert") {
      const staged = [];
      for (const raw of this.payload) {
        const row = clone(raw);
        const pk = PRIMARY_KEYS[table];
        if (this.op === "upsert") {
          const keys = (this.onConflict || (pk || ["id"]).join(",")).split(",").map((s) => s.trim());
          const existing = db.rows[table].find((r) => keys.every((k) => r[k] === row[k]));
          if (existing) { Object.assign(existing, row); staged.push(existing); continue; }
        } else if (pk && db.rows[table].some((r) => pk.every((k) => r[k] === row[k]))) {
          return this.fail(`duplicate key value violates unique constraint on ${table}`, "23505");
        }
        if (!pk && !row.id) row.id = crypto.randomUUID();
        if (!row.created_at) row.created_at = now;
        for (const [col, val] of Object.entries(db.defaults[table] || {})) if (row[col] === undefined) row[col] = clone(typeof val === "function" ? val() : val);
        db.rows[table].push(row);
        staged.push(row);
      }
      return this.finish(staged);
    }
    if (this.op === "update") {
      const rows = db.rows[table].filter((r) => this.filters.every((f) => f(r)));
      rows.forEach((r) => Object.assign(r, clone(this.payload)));
      return this.finish(rows);
    }
    if (this.op === "delete") {
      db.rows[table] = db.rows[table].filter((r) => !this.filters.every((f) => f(r)));
      return { data: null, error: null };
    }
    let rows = db.rows[table].filter((r) => this.filters.every((f) => f(r)));
    for (const { c, ascending } of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => (a[c] === b[c] ? 0 : (a[c] > b[c] ? 1 : -1) * (ascending ? 1 : -1)));
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    return this.finish(rows, true);
  }

  finish(rows, isSelect = false) {
    if (!isSelect && !this.returning) return { data: null, error: null };
    const out = rows.map((r) => this.embed(r));
    if (this.expect === "single") return out.length === 1 ? { data: out[0], error: null } : this.fail("JSON object requested, multiple (or no) rows returned", "PGRST116");
    if (this.expect === "maybeSingle") return out.length > 1 ? this.fail("multiple rows returned", "PGRST116") : { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }
}

class FakeLearningDb {
  constructor({ missing = [] } = {}) {
    this.missing = missing;
    this.failures = [];
    this.rows = Object.fromEntries(
      ["students", "quizzes", "quiz_attempts", "questions", "quiz_options", "answers", "learning_profiles", "topic_mastery", "adaptive_sessions", "adaptive_answers", "ai_tutor_logs"].map((t) => [t, []])
    );
    this.defaults = {
      adaptive_sessions: { status: "in_progress", answered_count: 0, correct_count: 0, xp_earned: 0, correct_streak: 0, wrong_streak: 0, started_at: () => new Date().toISOString(), level_path: () => [], served_ids: () => [] },
      learning_profiles: { preferred_language: "en", explanation_style: "step_by_step", accessibility: () => ({}), xp: 0, streak_days: 0, total_practice_answers: 0 },
    };
  }
  from(table) { return new Query(this, table); }
  failNext(table, op, times = 1) { this.failures.push({ table, op, remaining: times }); }
}

module.exports = { FakeLearningDb };
