import { io } from 'socket.io-client';
import { getToken } from './auth';

/**
 * Realtime connection.
 *
 * Polling is kept as a slow safety net rather than removed outright: if the
 * socket drops on a flaky campus network, the app still catches up, just less
 * promptly. The socket carries the same session token as the REST API, so it is
 * never more privileged.
 */

let socket = null;
const joined = new Set();

export function connect() {
  if (socket) return socket;
  const token = getToken();
  if (!token) return null;

  socket = io({ auth: { token }, transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    // Re-join every room after a reconnect; the server has forgotten us.
    for (const id of joined) socket.emit('join', id, () => {});
  });

  socket.on('connect_error', (err) => {
    // An expired session cannot be recovered by retrying — let the UI re-auth.
    if (err?.message === 'token_expired' || err?.message === 'unauthorized') {
      socket.close();
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

export function join(containerId) {
  if (!containerId) return;
  joined.add(containerId);
  connect()?.emit('join', containerId, () => {});
}

export function leave(containerId) {
  joined.delete(containerId);
  socket?.emit('leave', containerId);
}

/** Subscribe to an event; returns an unsubscribe function. */
export function on(event, handler) {
  const s = connect();
  if (!s) return () => {};
  s.on(event, handler);
  return () => s.off(event, handler);
}

export const sendTyping = (containerId, name) =>
  socket?.emit('typing', { containerId, name });
