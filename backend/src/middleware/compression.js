const zlib = require("zlib");

// Minimal gzip middleware (no extra dependency). Large JSON payloads —
// results tables, participation lists, question banks — go over the wire an
// order of magnitude smaller, which is the single biggest response-time win
// for the admin portal on slow networks.
const MIN_BYTES = 1024;

module.exports = function compression() {
  return function compressionMiddleware(req, res, next) {
    const accepts = String(req.headers["accept-encoding"] || "");
    if (!/\bgzip\b/i.test(accepts)) return next();

    const originalSend = res.send.bind(res);
    res.send = (body) => {
      try {
        if (res.headersSent || res.getHeader("Content-Encoding")) return originalSend(body);
        const isCompressible =
          typeof body === "string" || Buffer.isBuffer(body);
        if (!isCompressible) return originalSend(body);

        const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
        if (buffer.length < MIN_BYTES) return originalSend(body);

        const gzipped = zlib.gzipSync(buffer);
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Vary", "Accept-Encoding");
        res.removeHeader("Content-Length");
        return originalSend(gzipped);
      } catch {
        // Never let compression break a response.
        return originalSend(body);
      }
    };

    next();
  };
};
