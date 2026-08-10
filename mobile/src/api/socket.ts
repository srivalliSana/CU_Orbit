import { io, Socket } from "socket.io-client";

import { API_BASE_URL } from "../constants/config";
import { useAuthStore } from "../state/authStore";

// Realtime connection. Polling (see useMessages' refetchInterval) is kept as
// a slow safety net rather than removed outright: if the socket drops on a
// flaky campus network, the app still catches up, just less promptly. The
// socket carries the same session token as the REST API, so it is never more
// privileged. Ported from web/src/api/socket.js.

let socket: Socket | null = null;
const joined = new Set<string>();

// API_BASE_URL is ".../api" — the socket server listens on the bare origin.
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, "");

export function connect(): Socket | null {
  if (socket) return socket;
  const token = useAuthStore.getState().token;
  if (!token) return null;

  socket = io(SOCKET_URL, { auth: { token }, transports: ["websocket", "polling"] });

  socket.on("connect", () => {
    for (const id of joined) socket?.emit("join", id, () => {});
  });

  socket.on("connect_error", (err: Error) => {
    if (err?.message === "token_expired" || err?.message === "unauthorized") {
      socket?.close();
      socket = null;
    }
  });

  return socket;
}

export function disconnect() {
  socket?.close();
  socket = null;
  joined.clear();
}

export function join(containerId: string) {
  if (!containerId) return;
  joined.add(containerId);
  connect()?.emit("join", containerId, () => {});
}

export function leave(containerId: string) {
  joined.delete(containerId);
  socket?.emit("leave", containerId);
}

/** Subscribe to an event; returns an unsubscribe function. */
export function on(event: string, handler: (...args: any[]) => void) {
  const s = connect();
  if (!s) return () => {};
  s.on(event, handler);
  return () => s.off(event, handler);
}

export const sendTyping = (containerId: string, name: string) =>
  socket?.emit("typing", { containerId, name });
