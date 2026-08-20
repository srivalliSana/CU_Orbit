import React, { useEffect, useState } from 'react';
import { authorizeOAuthApp, getOAuthAuthorizeInfo } from '../api/admin';

/**
 * The real OAuth consent screen — reached via a hard link a third-party
 * app's own "Install on CU Orbit" button points at
 * (https://cumess.cutm.ac.in/portal?oauth_client_id=...&oauth_redirect_uri=...),
 * mirroring the existing /join/:code -> /portal?join=... pattern rather than
 * adding client-side routing for a link that must work as a real hard link.
 */
export default function OAuthConsentScreen({ params, currentUser, onDone }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    getOAuthAuthorizeInfo({ client_id: params.client_id, redirect_uri: params.redirect_uri, scope: params.scope || '' })
      .then(setInfo)
      .catch((e) => setError(e.message || 'This app could not be verified.'));
  }, [isAdmin, params.client_id, params.redirect_uri, params.scope]);

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      const { redirect_url } = await authorizeOAuthApp({
        client_id: params.client_id, redirect_uri: params.redirect_uri, scope: params.scope || '',
        state: params.state, code_challenge: params.code_challenge, code_challenge_method: params.code_challenge_method,
      });
      window.location.href = redirect_url;
    } catch (e) {
      setError(e.message || 'Could not install this app.');
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        {!isAdmin ? (
          <>
            <h1 className="text-center text-lg font-semibold text-slate-800 dark:text-slate-100">Admins only</h1>
            <p className="mt-2 text-center text-sm text-slate-500">
              Only workspace admins can install apps on CU Orbit.
            </p>
            <button onClick={onDone} className="mt-5 w-full rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
              Back to CU Orbit
            </button>
          </>
        ) : !info && !error ? (
          <p className="text-center text-sm text-slate-400">Loading…</p>
        ) : error ? (
          <>
            <h1 className="text-center text-lg font-semibold text-slate-800 dark:text-slate-100">Couldn't verify this app</h1>
            <p className="mt-2 text-center text-sm text-red-500">{error}</p>
            <button onClick={onDone} className="mt-5 w-full rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
              Back to CU Orbit
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center">
              {info.icon_url ? (
                <img src={info.icon_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 text-xl font-semibold text-white">
                  {info.name?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <h1 className="mt-3 text-lg font-semibold text-slate-800 dark:text-slate-100">{info.name}</h1>
              {info.description && <p className="mt-1 text-center text-xs text-slate-500">{info.description}</p>}
            </div>

            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-400">This app will be able to</p>
            <ul className="mt-1.5 space-y-1 text-sm text-slate-600 dark:text-slate-300">
              {(info.scopes || []).map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="text-emerald-500">✓</span>
                  {SCOPE_DESCRIPTIONS[s] || s}
                </li>
              ))}
            </ul>

            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

            <div className="mt-5 flex gap-2">
              <button
                onClick={onDone}
                className="flex-1 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={approve} disabled={busy}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? 'Installing…' : 'Allow'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const SCOPE_DESCRIPTIONS = {
  'commands': 'Register and receive slash commands',
  'chat:write': 'Post messages as its own bot, in channels it’s added to',
  'channels:read': 'Read channel and member lists',
};
