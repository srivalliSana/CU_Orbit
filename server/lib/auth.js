/**
 * Authentication for CU Orbit.
 *
 * Sign-in happens via Google (ID-token verification) or a passwordless email
 * OTP — see POST /api/auth/google and /api/auth/otp/* in server.js. Either
 * way, once someone is identified, this module mints one thing: the Orbit
 * session token below, signed with our own ORBIT_JWT_SECRET. That's what
 * every subsequent API call and socket handshake carries.
 */

const jwt = require('jsonwebtoken');

const ORBIT_SECRET = process.env.ORBIT_JWT_SECRET;

const SESSION_TTL = process.env.ORBIT_SESSION_TTL || '7d';
const AUDIENCE = 'cu-orbit';

function assertSecrets() {
    if (!ORBIT_SECRET) {
        throw new Error('Missing required secret: ORBIT_JWT_SECRET. Set it in server/.env.');
    }
}

/** Mint an Orbit session token for a local user row. */
function issueSession(user) {
    assertSecrets();
    return jwt.sign(
        { sub: user.id, email: user.campus_email || user.email, role: user.role || 'student' },
        ORBIT_SECRET,
        { algorithm: 'HS256', expiresIn: SESSION_TTL, audience: AUDIENCE }
    );
}

function verifySession(token) {
    assertSecrets();
    return jwt.verify(token, ORBIT_SECRET, { algorithms: ['HS256'], audience: AUDIENCE });
}

function bearer(req) {
    const h = req.get('authorization') || '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

/**
 * Express middleware — populates req.user or rejects with 401.
 * Every route that touches user data must sit behind this.
 */
// Called with the user id on every authenticated request. Set by server.js to
// refresh last_seen; kept as a hook so this module stays free of database
// concerns.
let onAuthenticated = null;
const setOnAuthenticated = (fn) => { onAuthenticated = fn; };

function requireAuth(req, res, next) {
    const token = bearer(req);
    if (!token) return res.status(401).json({ error: 'unauthorized', message: 'Missing bearer token' });
    try {
        const claims = verifySession(token);
        req.user = { id: claims.sub, email: claims.email, role: claims.role };
        // Must never break the request it is observing.
        try { onAuthenticated?.(req.user.id); } catch (e) { /* ignore */ }
        next();
    } catch (e) {
        const expired = e.name === 'TokenExpiredError';
        res.status(401).json({ error: expired ? 'token_expired' : 'unauthorized', message: e.message });
    }
}

/** Route guard for staff-only operations. Use after requireAuth. */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'unauthorized' });
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'forbidden', message: `Requires role: ${roles.join(' or ')}` });
        }
        next();
    };
}

module.exports = { issueSession, verifySession, requireAuth, requireRole, assertSecrets, setOnAuthenticated, AUDIENCE };
