const path = require("path");
const SRC = path.join(__dirname, "..", "..", "src");

// Never let a test reach a real AI provider even though backend/.env is loaded by dotenv.
function neutralEnv(extra = {}) {
  for (const k of ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "AI_PROVIDER"]) process.env[k] = "";
  Object.assign(process.env, extra);
}

function loadAi(db, envExtra = {}) {
  neutralEnv(envExtra);
  for (const key of Object.keys(require.cache)) if (key.startsWith(SRC)) delete require.cache[key];
  const clientPath = require.resolve(path.join(SRC, "config", "supabaseClient"));
  require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: { getSupabase: () => db }, children: [], paths: [] };
  const r = (...p) => require(path.join(SRC, ...p));
  return {
    learning: r("controllers", "aiLearningController"),
    tutor: r("controllers", "aiTutorController"),
    admin: r("controllers", "adminLearningController"),
    auth: r("middleware", "auth"),
    engine: r("utils", "adaptiveEngine"),
    provider: r("utils", "aiProvider"),
    curriculum: r("data", "curriculum"),
    jwt: r("utils", "jwt"),
  };
}

// Calls an Express handler directly. Resolves {status, body}; rejects with whatever is passed to next().
function call(handler, { params = {}, body = {}, query = {}, student } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); return this; },
    };
    handler({ params, body, query, student, headers: {} }, res, (err) => reject(err));
  });
}

module.exports = { loadAi, call, neutralEnv };
