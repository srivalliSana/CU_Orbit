/**
 * Server-to-server client for CampusOne's directory.
 *
 * Uses the client_credentials grant: this authenticates CU Orbit as a service,
 * not as any user, and the resulting token is scoped to read:roster — it cannot
 * act on anyone's behalf. Kept strictly separate from the per-user handoff
 * tokens in lib/auth.js.
 */

const CAMPUS_URL = (process.env.CAMPUS_URL || 'https://campusone.cutm.ac.in').replace(/\/$/, '');
const CLIENT_ID = process.env.CAMPUS_CLIENT_ID;
const CLIENT_SECRET = process.env.CAMPUS_CLIENT_SECRET;

const configured = () => Boolean(CLIENT_ID && CLIENT_SECRET);

// Tokens last an hour; re-request a minute early rather than racing expiry.
let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
    if (!configured()) throw new Error('CampusOne directory is not configured (CAMPUS_CLIENT_ID/SECRET)');
    if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

    const res = await fetch(`${CAMPUS_URL}/api/v1/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials' }),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`CampusOne token request failed (${res.status}) ${detail.slice(0, 120)}`);
    }
    const data = await res.json();
    if (!data.access_token) throw new Error('CampusOne returned no access_token');

    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + Math.max((Number(data.expires_in) || 3600) - 60, 60) * 1000;
    return cachedToken;
}

// The directory changes slowly and is queried on every keystroke-ish search, so
// it is cached in memory rather than fetched per request.
let directory = [];
let directoryFetchedAt = 0;
const DIRECTORY_TTL_MS = Number(process.env.CAMPUS_DIRECTORY_TTL_MS || 10 * 60 * 1000);
let inFlight = null;

async function loadDirectory(force = false) {
    if (!force && directory.length && Date.now() - directoryFetchedAt < DIRECTORY_TTL_MS) return directory;
    // Collapse concurrent refreshes into one upstream call.
    if (inFlight) return inFlight;

    inFlight = (async () => {
        try {
            const token = await getToken();
            const res = await fetch(`${CAMPUS_URL}/api/v1/directory?limit=1000`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                // Token rejected — drop it so the next attempt re-authenticates.
                cachedToken = null; tokenExpiresAt = 0;
                throw new Error('CampusOne rejected the directory token');
            }
            if (!res.ok) throw new Error(`CampusOne directory failed (${res.status})`);
            const data = await res.json();
            directory = Array.isArray(data.data) ? data.data : [];
            directoryFetchedAt = Date.now();
            return directory;
        } finally {
            inFlight = null;
        }
    })();

    return inFlight;
}

/**
 * Search the campus directory. Returns [] when unconfigured or unreachable —
 * people search degrades to CU Orbit's own users rather than erroring.
 */
async function searchDirectory(term, limit = 25) {
    if (!configured()) return [];
    let people;
    try {
        people = await loadDirectory();
    } catch (e) {
        console.warn('[campus] directory unavailable:', e.message);
        return [];
    }

    const q = String(term || '').trim().toLowerCase();
    if (!q) return people.slice(0, limit);

    const scored = [];
    for (const p of people) {
        const name = (p.name || '').toLowerCase();
        const email = (p.email || '').toLowerCase();
        if (name.startsWith(q)) scored.push([0, p]);
        else if (name.includes(q)) scored.push([1, p]);
        else if (email.startsWith(q)) scored.push([2, p]);
        else if (email.includes(q) || (p.regno || '').toLowerCase().includes(q)) scored.push([3, p]);
        if (scored.length > limit * 8) break;
    }
    // Best matches first: name prefix, then name substring, then email.
    scored.sort((a, b) => a[0] - b[0]);
    return scored.slice(0, limit).map(([, p]) => p);
}

module.exports = { configured, getToken, loadDirectory, searchDirectory, CAMPUS_URL };
