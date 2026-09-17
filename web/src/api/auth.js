/**
 * Sign-in for the web client.
 *
 * Two methods, both gated to a CUTM campus email (@cutm.ac.in / @cutmap.ac.in)
 * by the server — CampusOne SSO is no longer involved:
 *   1. Google — an OAuth2 access token (accounts.oauth2, prompt: 'select_account'
 *      so the account chooser always shows), verified server-side.
 *   2. Email OTP — a one-time code emailed to the user, no password.
 */

const KEY = 'orbit_session';

export const getToken = () => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};

const setToken = (t) => {
  try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* private mode */ }
};

/** Clears the local session; the app should show the sign-in screen afterward. */
export const signOut = () => setToken(null);

async function json(resOrPromise) {
  const res = await resOrPromise;   // accepts a Response or a still-pending fetch() call
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const err = new Error(detail.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = detail.error;
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

export const getConfig = () => json(fetch('/api/config'));

/** Resolve a stored session, if any. Returns the user, or null if signed out. */
export async function checkSession() {
  if (!getToken()) return null;
  try {
    const d = await api('/api/auth/me');
    return d.user;
  } catch {
    return null; // expired or invalid — the caller shows the sign-in screen
  }
}

// Takes an OAuth2 access token (from accounts.oauth2.initTokenClient — see
// SignInScreen), not an ID token. Only that API supports prompt:
// 'select_account', which is why the button flow isn't used here.
export async function signInWithGoogle(accessToken) {
  const d = await json(fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  }));
  // 2FA-enabled accounts don't get a session yet — a second emailed code
  // (see verifyTwoFactor below) has to land first.
  if (d.twofa_required) return { twofaRequired: true, twofaToken: d.twofa_token };
  setToken(d.session);
  return { user: d.user };
}

export async function verifyTwoFactor(twofaToken, code) {
  const d = await json(await fetch('/api/auth/2fa/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ twofa_token: twofaToken, code }),
  }));
  setToken(d.session);
  return d.user;
}

export const resendTwoFactor = (twofaToken) =>
  json(fetch('/api/auth/2fa/resend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ twofa_token: twofaToken }),
  }));

// Enrollment (from Settings) — requires an active session, unlike the
// sign-in-step endpoints above.
export const startTwoFactorEnroll = () => api('/api/auth/2fa/enable/start', { method: 'POST' });
export const confirmTwoFactorEnroll = (code) =>
  api('/api/auth/2fa/enable/confirm', { method: 'POST', body: JSON.stringify({ code }) }).then((d) => d.user);
export const disableTwoFactor = () => api('/api/auth/2fa/disable', { method: 'POST' }).then((d) => d.user);

export const requestOtp = (email) =>
  json(fetch('/api/auth/otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  }));

export async function verifyOtp(email, code) {
  const d = await json(await fetch('/api/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  }));
  setToken(d.session);
  return d.user;
}
