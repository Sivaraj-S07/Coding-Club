const { Server } = require("socket.io");
const { verifyToken } = require("./utils/jwt");

let io = null;

/**
 * Real-time channel for the Admin Portal.
 *
 * Only clients presenting a valid ADMIN JWT can connect — students never join,
 * so no student-visible data (answer keys, other students' results) can leak
 * through the socket. Every event is broadcast to the "admins" room.
 */
function initRealtime(httpServer, origins) {
  io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: origins, credentials: true },
  });

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return next(new Error("Missing admin token"));
    try {
      const payload = verifyToken(token);
      if (payload.role !== "admin") return next(new Error("Admin access required"));
      socket.data.admin = payload;
      next();
    } catch {
      next(new Error("Invalid or expired admin session"));
    }
  });

  io.on("connection", (socket) => {
    socket.join("admins");
  });

  return io;
}

/** Broadcast an event to every connected admin (no-op when sockets are off). */
function emitAdmin(event, payload) {
  if (!io) return;
  try {
    io.to("admins").emit(event, payload);
  } catch {
    // never let a realtime failure break an HTTP request
  }
}

module.exports = { initRealtime, emitAdmin };
