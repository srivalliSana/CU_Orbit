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
    // Wait for CampusOne to hand the token over. It arrives right after load,
    // so a miss usually means the parent page failed to mint one.
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('CampusOne did not provide a sign-in token.')),
        15000
      );
      window.addEventListener('message', async (ev) => {
        if (ev.origin !== campusOrigin) return;              // only ever trust CampusOne
        const d = ev.data || {};
        if (d.type !== 'campusone:handoff' || !d.token) return;
        clearTimeout(timer);
        try {
          const user = await exchange(d.token);
          sessionStorage.removeItem(REDIRECT_FLAG);
          resolve(user);
        } catch (e) { reject(e); }
      });
    });
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
