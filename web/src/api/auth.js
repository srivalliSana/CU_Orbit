/**
 * Sign-in for the web client.
 *
 * There is no local login — CampusOne is the only identity source. Two ways in:
 *   1. Embedded: CampusOne frames us and postMessages a 60s handoff token.
 *   2. Standalone: no valid stored session, so bounce to CampusOne, which signs
 *      the user in and frames us back.
 */

const KEY = 'orbit_session';
const REDIRECT_FLAG = 'orbit_redirected';

export const getToken = () => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};

const setToken = (t) => {
  try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* private mode */ }
};

export const inIframe = () => {
  try { return window.self !== window.top; } catch { return true; }
};

/**
 * The handoff arrives the instant the frame loads — before signIn() has
 * finished awaiting /api/config. postMessage does not queue for listeners that
 * register later, so the listener is installed synchronously at module load and
 * buffers whatever turns up. Waiters registered afterwards are handed the
 * buffered value.
 *
 * We also announce readiness to the parent, so a parent that missed the eager
 * post can send it again. Belt and braces: whichever arrives first wins.
 */
let bufferedHandoff = null;
let handoffWaiter = null;

if (typeof window !== 'undefined' && inIframe()) {
  window.addEventListener('message', (ev) => {
    const d = ev.data || {};
    if (d.type !== 'campusone:handoff' || !d.token) return;
    // Origin is verified in signIn(), which knows the configured campus URL.
    // Here we only capture; nothing is trusted until that check runs.
    if (handoffWaiter) handoffWaiter({ token: d.token, origin: ev.origin });
    else bufferedHandoff = { token: d.token, origin: ev.origin };
  });

  // No secret in this message, so a wildcard target is safe; we do not know the
  // parent's origin until /api/config resolves, and that is the point.
  try { window.parent.postMessage({ type: 'orbit:ready' }, '*'); } catch { /* ignore */ }
}

const awaitHandoff = (timeoutMs) =>
  new Promise((resolve, reject) => {
    if (bufferedHandoff) return resolve(bufferedHandoff);
    const timer = setTimeout(() => {
      handoffWaiter = null;
      reject(new Error('CampusOne did not provide a sign-in token.'));
    }, timeoutMs);
    handoffWaiter = (v) => { clearTimeout(timer); handoffWaiter = null; resolve(v); };
  });

async function json(res) {
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const err = new Error(detail.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Authenticated fetch. 401 clears the session so the caller can re-auth. */
export async function api(path, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) { setToken(null); }
  return json(res);
}

const exchange = async (handoff) => {
  const d = await json(await fetch('/api/auth/sso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: handoff }),
  }));
  setToken(d.session);
  return d.user;
};

/**
 * Resolve a session. Returns the user, or null while a redirect is in flight.
 * Throws only when sign-in is genuinely impossible, so the UI can say so.
 */
export async function signIn() {
  const cfg = await json(await fetch('/api/config'));
  const campusOrigin = new URL(cfg.campus_url).origin;

  // A stored session is the fast path in both modes.
  const existing = getToken();
  if (existing) {
    try {
      const d = await api('/api/auth/me');
      sessionStorage.removeItem(REDIRECT_FLAG);
      return d.user;
    } catch { /* expired — fall through */ }
  }

  if (inIframe()) {
    // Ask again now that the parent origin is known — covers a parent that was
    // not yet listening when we first announced readiness.
    try { window.parent.postMessage({ type: 'orbit:ready' }, campusOrigin); } catch { /* ignore */ }

    const { token, origin } = await awaitHandoff(15000);
    // Only now is the token trusted: it must have come from the configured
    // CampusOne origin, not merely from some parent frame.
    if (origin !== campusOrigin) {
      throw new Error('Sign-in token came from an unexpected origin.');
    }
    const user = await exchange(token);
    sessionStorage.removeItem(REDIRECT_FLAG);
    return user;
  }

  // Standalone: send them to CampusOne to sign in, guarding against a loop if
  // the handshake is misconfigured.
  if (sessionStorage.getItem(REDIRECT_FLAG)) {
    throw new Error('Could not sign in through CampusOne. Please try again from the CampusOne menu.');
  }
  sessionStorage.setItem(REDIRECT_FLAG, '1');
  window.location.href = cfg.campus_url + cfg.connect_path;
  return null;
}
