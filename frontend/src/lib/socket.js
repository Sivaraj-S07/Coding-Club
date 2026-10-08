import { io } from "socket.io-client";
import { API_URL } from "./api";

// The realtime channel lives on the API origin (API_URL ends with /api).
const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

/**
 * Connect to the admin realtime channel. The admin JWT is verified by the
 * server on handshake, so an unauthenticated client can never subscribe.
 * @param {string} token admin JWT
 * @param {Record<string, Function>} handlers event name -> handler
 * @returns {Function} disconnect
 */
export function connectAdminSocket(token, handlers = {}) {
  if (!token) return () => {};
  const socket = io(SOCKET_URL, {
    path: "/socket.io",
    auth: { token },
    transports: ["websocket", "polling"],
    reconnectionDelay: 1000,
  });
  Object.entries(handlers).forEach(([event, fn]) => socket.on(event, fn));
  return () => {
    socket.removeAllListeners();
    socket.disconnect();
  };
}
