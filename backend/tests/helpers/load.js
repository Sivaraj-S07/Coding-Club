const path = require("path");

const SRC = path.join(__dirname, "..", "..", "src");

// Loads the controllers with `getSupabase()` returning the given fake DB.
// Everything under src/ is re-required so module-level caches (the
// feature-support probes) start fresh for every test database.
function loadFresh(db) {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(SRC)) delete require.cache[key];
  }
  const clientPath = require.resolve(path.join(SRC, "config", "supabaseClient"));
  require.cache[clientPath] = {
    id: clientPath,
    filename: clientPath,
    loaded: true,
    exports: { getSupabase: () => db },
    children: [],
    paths: [],
  };
  return {
    pdf: require(path.join(SRC, "controllers", "adminQuizPdfController")),
    transfer: require(path.join(SRC, "utils", "quizTransfer")),
  };
}

// Calls an express handler (wrapped by asyncHandler) without a server.
// Resolves with { status, body, headers }; rejects with whatever error the
// handler passed to next() (an ApiError for expected failures).
function call(handler, { params = {}, body = {}, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      headers: {},
      set(k, v) {
        this.headers[k] = v;
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.statusCode, body: payload, headers: this.headers });
        return this;
      },
    };
    handler({ params, body, query }, res, (err) => reject(err));
  });
}

module.exports = { loadFresh, call };
