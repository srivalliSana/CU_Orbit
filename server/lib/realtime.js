/**
 * Realtime layer.
 *
 * Replaces polling for messages, typing, presence and read receipts. REST is
 * retained for history and pagination — sockets deliver what is new, not what
 * already happened.
 *
 * Rooms mirror the existing container model exactly:
 *   channel:<uuid>   a channel
 *   dm:<uuidA_uuidB> a direct conversation
 *   user:<uuid>      one person's own devices, for badge counts
 */

const { Server } = require('socket.io');
const auth = require('./auth');

let io = null;

// userId -> number of live sockets. Presence is per-connection because one
// person may have the web app and their phone open at once; they only go
// offline when the last one closes.
const connections = new Map();

function roomFor(containerId) {
    if (!containerId) return null;
    return containerId.includes('_') ? `dm:${containerId}` : `channel:${containerId}`;
}

/**
 * @param httpServer         node http server to attach to
 * @param deps.canAccess     (userId, containerId, user) => Promise<boolean>
 * @param deps.onPresence    (userId, isOnline) => void
 */
function init(httpServer, deps = {}) {
    const { canAccess, onPresence } = deps;
    const origins = (process.env.CAMPUS_URL || 'https://campusone.cutm.ac.in')
        .split(',').map((s) => s.trim()).filter(Boolean);

    io = new Server(httpServer, {
        cors: { origin: [...origins, /localhost:\d+$/], credentials: true },
        // Long enough to survive a phone changing networks, short enough that
        // presence is not badly wrong.
        pingTimeout: 25000,
    });

    // The handshake carries the same Orbit session token as the REST API, so a
    // socket can never be more privileged than an HTTP call.
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('unauthorized'));
        try {
            const claims = auth.verifySession(token);
            socket.data.userId = claims.sub;
            socket.data.role = claims.role;
            next();
        } catch (e) {
            next(new Error(e.name === 'TokenExpiredError' ? 'token_expired' : 'unauthorized'));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.data.userId;
        socket.join(`user:${userId}`);

        const count = (connections.get(userId) || 0) + 1;
        connections.set(userId, count);
        if (count === 1) {
            onPresence?.(userId, true);
            socket.broadcast.emit('presence', { userId, presence: 'online' });
        }

        // Membership is checked on every join — a socket must not be able to
        // subscribe to a conversation the same user could not read over REST.
        socket.on('join', async (containerId, ack) => {
            try {
                // Pass the role so role-based visibility matches REST exactly;
                // otherwise an admin could read a group's history but receive no
                // live updates in it.
                if (!(await canAccess(userId, containerId, { id: userId, role: socket.data.role }))) {
                    return ack?.({ ok: false, error: 'forbidden' });
                }
                socket.join(roomFor(containerId));
                ack?.({ ok: true });
            } catch (e) {
                ack?.({ ok: false, error: 'error' });
            }
        });

        socket.on('leave', (containerId) => {
            const room = roomFor(containerId);
            if (room) socket.leave(room);
        });

        // Typing is transient and never stored: broadcast to the room, skipping
        // the sender, and let it expire on the client.
        socket.on('typing', async ({ containerId, name }) => {
            if (!(await canAccess(userId, containerId, { id: userId, role: socket.data.role }))) return;
            socket.to(roomFor(containerId)).emit('typing', { containerId, userId, name });
        });

        socket.on('disconnect', () => {
            const left = (connections.get(userId) || 1) - 1;
            if (left <= 0) {
                connections.delete(userId);
                onPresence?.(userId, false);
                socket.broadcast.emit('presence', { userId, presence: 'offline' });
            } else {
                connections.set(userId, left);
            }
        });
    });

    return io;
}

/** Emit to everyone in a conversation. No-op before init, so REST still works. */
function toContainer(containerId, event, payload) {
    const room = roomFor(containerId);
    if (io && room) io.to(room).emit(event, payload);
}

/** Emit to one person across all their devices. */
function toUser(userId, event, payload) {
    if (io && userId) io.to(`user:${userId}`).emit(event, payload);
}

const isOnline = (userId) => (connections.get(userId) || 0) > 0;

module.exports = { init, toContainer, toUser, isOnline, roomFor };
