/**
 * Authentication for CU Orbit.
 *
 * Two distinct tokens are involved — keeping them separate matters:
 *
 *   1. Handoff token  — minted by CampusOne (lib/apiauth.ts signJwt), HS256 over
 *      the shared API_JWT_SECRET, ~60s TTL, aud "cu-orbit". It only ever proves
 *      "CampusOne says this is user X", and is exchanged exactly once.
 *   2. Session token  — minted here, signed with our own ORBIT_JWT_SECRET. This
 *      is what every subsequent API call and socket handshake carries.
 *
 * They must not share a secret: a leaked Orbit session token must never be
 * replayable against CampusOne, and vice versa.
 */

const jwt = require('jsonwebtoken');

// Shared with CampusOne. Must equal its API_JWT_SECRET (which itself falls back
// to NEXTAUTH_SECRET there). No default — an unset secret is a hard failure
// rather than a silently-guessable one.
const CAMPUS_SECRET = process.env.CAMPUS_JWT_SECRET;
// Ours alone.
const ORBIT_SECRET = process.env.ORBIT_JWT_SECRET;

const SESSION_TTL = process.env.ORBIT_SESSION_TTL || '7d';
const AUDIENCE = 'cu-orbit';

function assertSecrets() {
    const missing = [];
    if (!CAMPUS_SECRET) missing.push('CAMPUS_JWT_SECRET');
    if (!ORBIT_SECRET) missing.push('ORBIT_JWT_SECRET');
    if (missing.length) {
        throw new Error(
            `Missing required secret(s): ${missing.join(', ')}. ` +
            `Set them in server/.env — CAMPUS_JWT_SECRET must match CampusOne's API_JWT_SECRET.`
        );
    }
}

/**
 * Verify a CampusOne handoff token. Returns the claims, or throws.
 * Rejects anything not explicitly addressed to us.
 */
function verifyHandoff(token) {
    assertSecrets();
    const claims = jwt.verify(token, CAMPUS_SECRET, {
        algorithms: ['HS256'],   // pinned: never let the token pick "none" or RS256
        audience: AUDIENCE,
        clockTolerance: 10,      // seconds, for host clock drift
    });
    if (!claims.email) throw new Error('handoff token carries no email claim');
    return claims;
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
function requireAuth(req, res, next) {
    const token = bearer(req);
    if (!token) return res.status(401).json({ error: 'unauthorized', message: 'Missing bearer token' });
    try {
        const claims = verifySession(token);
        req.user = { id: claims.sub, email: claims.email, role: claims.role };
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

module.exports = { verifyHandoff, issueSession, verifySession, requireAuth, requireRole, assertSecrets, AUDIENCE };
