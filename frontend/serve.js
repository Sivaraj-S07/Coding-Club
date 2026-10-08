// Optional SPA server for hosts that run a Node web service instead of a
// static site (e.g. Render "Web Service"). Serves the Vite build in dist/ and
// falls back to index.html so deep links like /admin work on refresh.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");
const PORT = process.env.PORT || 4173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

function send(res, filePath, status = 200) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(status, { "content-type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const candidate = path.normalize(path.join(DIST, urlPath));

    if (candidate.startsWith(DIST) && urlPath !== "/" && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return send(res, candidate);
    }
    // SPA fallback: every unknown path renders the app (React Router handles it).
    return send(res, path.join(DIST, "index.html"));
  })
  .listen(PORT, () => console.log(`Frontend served on port ${PORT}`));
