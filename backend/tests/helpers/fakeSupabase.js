const crypto = require("crypto");

// ----------------------------------------------------------------------------
// A tiny in-memory stand-in for the parts of supabase-js the quiz controllers
// use. It is deliberately STRICT, the way Postgres/PostgREST is:
//
//   * inserting or selecting a column the table doesn't have is an error
//     (this is what proves the import only writes columns that exist on an
//     older database),
//   * NOT NULL columns reject null,
//   * integer columns reject fractions,
//   * deleting a quiz cascades to its rounds / questions / options.
// ----------------------------------------------------------------------------

const SCHEMA = {
  quizzes: {
    columns: [
      "id", "title", "description", "password_hash", "duration_minutes", "start_time", "end_time",
      "max_marks", "passing_percentage", "max_attempts", "randomize_questions", "randomize_options",
      "auto_submit", "allow_late_join", "show_leaderboard", "tab_switch_limit", "status", "placement",
      "created_at", "updated_at",
    ],
    notNull: ["title", "password_hash"],
    integers: ["duration_minutes", "max_attempts", "tab_switch_limit"],
    enums: { status: ["draft", "upcoming", "live", "completed"], placement: ["quizzes", "landing"] },
  },
  rounds: {
    columns: ["id", "quiz_id", "name", "description", "order_index", "qualification_percentage", "created_at", "updated_at"],
    notNull: ["quiz_id", "name"],
    integers: ["order_index"],
  },
  questions: {
    columns: [
      "id", "quiz_id", "question_text", "marks", "negative_marks", "order_index", "created_at", "updated_at",
      "question_type", "language", "starter_code", "expected_output", "reference_solution", "blank_answers",
      "case_sensitive", "round_id", "time_limit_seconds", "problem_statement", "input_format", "output_format",
      "constraints_text", "sample_io", "test_cases", "time_limit_ms", "allowed_languages",
    ],
    notNull: ["quiz_id", "question_text"],
    integers: ["order_index", "time_limit_seconds", "time_limit_ms"],
    enums: { question_type: ["mcq", "coding", "fill_blank"] },
  },
  // Only probed by the feature-support checks (answers.judge_result).
  answers: {
    columns: ["id", "attempt_id", "question_id", "selected_option_id", "code_answer", "judge_result", "language"],
    notNull: [],
    integers: [],
  },
  quiz_options: {
    columns: ["id", "question_id", "option_text", "is_correct", "order_index"],
    notNull: ["question_id", "option_text"],
    integers: ["order_index"],
  },
};

const clone = (v) => (v === undefined ? v : structuredClone(v));

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.op = "select";
    this.filters = [];
    this.orders = [];
    this.limitN = null;
    this.cols = "*";
    this.head = false;
    this.count = null;
    this.payload = null;
    this.expect = null; // "single" | "maybeSingle"
    this.returning = false;
  }

  select(cols = "*", opts = {}) {
    if (this.op === "insert") this.returning = true;
    this.cols = cols;
    this.head = !!opts.head;
    this.count = opts.count || null;
    return this;
  }
  insert(rows) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col, val) {
    this.filters.push((r) => r[col] === val);
    this.filterCols = [...(this.filterCols || []), col];
    return this;
  }
  is(col, val) {
    this.filters.push((r) => (val === null ? r[col] == null : r[col] === val));
    this.filterCols = [...(this.filterCols || []), col];
    return this;
  }
  order(col, { ascending = true } = {}) {
    this.orders.push({ col, ascending });
    return this;
  }
  limit(n) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.expect = "maybeSingle";
    return this;
  }
  single() {
    this.expect = "single";
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve().then(() => this.execute()).then(resolve, reject);
  }

  fail(message, code) {
    return { data: null, error: { message, code, details: "" } };
  }

  execute() {
    const { db, table } = this;
    const schema = SCHEMA[table];
    if (!schema) return this.fail(`relation "${table}" does not exist`, "42P01");
    const columns = db.columnsOf(table);
    if (!columns) return this.fail(`relation "${table}" does not exist`, "42P01");

    if (db.failures.some((f) => f.table === table && f.op === this.op && f.remaining-- > 0)) {
      return this.fail(`simulated ${this.op} failure on ${table}`, "XX000");
    }

    if (this.op === "insert") return this.doInsert(schema, columns);
    if (this.op === "delete") return this.doDelete();

    // ---- select ----
    const wanted = this.cols
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c && c !== "*" && !c.includes("("));
    const unknown = wanted.find((c) => !columns.has(c));
    if (unknown) return this.fail(`column ${table}.${unknown} does not exist`, "42703");
    const badFilter = (this.filterCols || []).find((c) => !columns.has(c));
    if (badFilter) return this.fail(`column ${table}.${badFilter} does not exist`, "42703");

    let rows = db.rows[table].filter((r) => this.filters.every((f) => f(r)));
    for (const { col, ascending } of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (ascending ? 1 : -1);
      });
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);

    const embedsOptions = /quiz_options\s*\(/.test(this.cols);
    const out = rows.map((r) => {
      const copy = clone(r);
      if (table === "questions" && embedsOptions) {
        copy.quiz_options = db.rows.quiz_options.filter((o) => o.question_id === r.id).map(clone);
      }
      return copy;
    });

    if (this.head) return { data: null, error: null, count: out.length };
    if (this.expect === "single") {
      if (out.length !== 1) return this.fail("JSON object requested, multiple (or no) rows returned", "PGRST116");
      return { data: out[0], error: null };
    }
    if (this.expect === "maybeSingle") {
      if (out.length > 1) return this.fail("multiple rows returned", "PGRST116");
      return { data: out[0] ?? null, error: null };
    }
    return { data: out, error: null };
  }

  doInsert(schema, columns) {
    const { db, table } = this;
    const staged = [];
    for (const raw of this.payload) {
      const row = clone(raw);
      const unknown = Object.keys(row).find((c) => !columns.has(c));
      if (unknown) return this.fail(`Could not find the '${unknown}' column of '${table}' in the schema cache`, "PGRST204");
      if (!row.id) row.id = crypto.randomUUID();
      const now = new Date().toISOString();
      if (columns.has("created_at") && !row.created_at) row.created_at = now;
      if (columns.has("updated_at") && !row.updated_at) row.updated_at = now;
      for (const c of schema.notNull || []) {
        if (row[c] === undefined || row[c] === null) return this.fail(`null value in column "${c}" violates not-null constraint`, "23502");
      }
      for (const c of schema.integers || []) {
        if (row[c] !== undefined && row[c] !== null && !Number.isInteger(row[c])) {
          return this.fail(`invalid input syntax for type integer: "${row[c]}"`, "22P02");
        }
      }
      for (const [c, allowed] of Object.entries(schema.enums || {})) {
        if (columns.has(c) && row[c] !== undefined && row[c] !== null && !allowed.includes(row[c])) {
          return this.fail(`new row violates check constraint on "${c}"`, "23514");
        }
      }
      // Foreign keys (parents must already exist, like real Postgres).
      if (table === "rounds" && !db.rows.quizzes.some((q) => q.id === row.quiz_id)) return this.fail("foreign key violation rounds.quiz_id", "23503");
      if (table === "questions") {
        if (!db.rows.quizzes.some((q) => q.id === row.quiz_id)) return this.fail("foreign key violation questions.quiz_id", "23503");
        if (row.round_id && !db.rows.rounds.some((r) => r.id === row.round_id)) return this.fail("foreign key violation questions.round_id", "23503");
      }
      if (table === "quiz_options" && !db.rows.questions.some((q) => q.id === row.question_id)) {
        return this.fail("foreign key violation quiz_options.question_id", "23503");
      }
      // Column defaults that the app relies on.
      if (table === "questions") {
        if (row.question_type === undefined) row.question_type = "mcq";
        if (row.negative_marks === undefined) row.negative_marks = 0;
        if (columns.has("case_sensitive") && row.case_sensitive === undefined) row.case_sensitive = false;
      }
      if (table === "quizzes" && columns.has("placement") && row.placement === undefined) row.placement = "quizzes";
      staged.push(row);
    }
    db.rows[table].push(...staged);
    if (!this.returning) return { data: null, error: null };
    const out = staged.map(clone);
    if (this.expect === "single") return { data: out[0], error: null };
    return { data: out, error: null };
  }

  doDelete() {
    const { db, table } = this;
    const doomed = db.rows[table].filter((r) => this.filters.every((f) => f(r)));
    const ids = new Set(doomed.map((r) => r.id));
    db.rows[table] = db.rows[table].filter((r) => !ids.has(r.id));
    if (table === "quizzes") {
      const roundIds = new Set(db.rows.rounds.filter((r) => ids.has(r.quiz_id)).map((r) => r.id));
      void roundIds;
      db.rows.rounds = db.rows.rounds.filter((r) => !ids.has(r.quiz_id));
      const questionIds = new Set(db.rows.questions.filter((q) => ids.has(q.quiz_id)).map((q) => q.id));
      db.rows.questions = db.rows.questions.filter((q) => !ids.has(q.quiz_id));
      db.rows.quiz_options = db.rows.quiz_options.filter((o) => !questionIds.has(o.question_id));
    }
    return { data: null, error: null };
  }
}

class FakeDb {
  /**
   * @param {object} [opts]
   * @param {Record<string,string[]>} [opts.missingColumns] columns to pretend an older database lacks
   * @param {string[]} [opts.missingTables] tables to pretend do not exist
   */
  constructor({ missingColumns = {}, missingTables = [] } = {}) {
    this.rows = { quizzes: [], rounds: [], questions: [], quiz_options: [], answers: [] };
    this.missingColumns = missingColumns;
    this.missingTables = missingTables;
    this.failures = [];
  }
  columnsOf(table) {
    if (this.missingTables.includes(table)) return null;
    const missing = new Set(this.missingColumns[table] || []);
    return new Set(SCHEMA[table].columns.filter((c) => !missing.has(c)));
  }
  /** Make the next `times` operations of kind `op` on `table` fail. */
  failNext(table, op, times = 1) {
    this.failures.push({ table, op, remaining: times });
  }
  from(table) {
    return new Query(this, table);
  }
  snapshot() {
    return JSON.stringify(this.rows);
  }
}

module.exports = { FakeDb };
