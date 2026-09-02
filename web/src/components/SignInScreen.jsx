import React, { useEffect, useRef, useState } from 'react';
import { getConfig, requestOtp, signInWithGoogle, verifyOtp } from '../api/auth';

/** Shown when there is no valid session — Google or email-OTP sign-in, gated to a CUTM campus email. */
export default function SignInScreen({ onSignedIn }) {
  const [googleReady, setGoogleReady] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const tokenClientRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getConfig()
      .then(async (cfg) => {
        if (cancelled || !cfg.google_web_client_id) return;
        // The GIS script tag in index.html loads async — poll briefly rather
        // than assuming it has landed by the time this effect runs.
        for (let i = 0; i < 40 && !window.google?.accounts?.oauth2; i++) {
          await new Promise((r) => setTimeout(r, 100));
        }
        if (cancelled || !window.google?.accounts?.oauth2) return;

        // accounts.oauth2 (token client), not accounts.id (the rendered
        // button) — only this API supports prompt: 'select_account'. The
        // button API silently completes with whatever Google account is
        // already active in the browser, with no documented way to force
        // the chooser to show.
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: cfg.google_web_client_id,
          scope: 'openid email profile',
          prompt: 'select_account',
          callback: async (resp) => {
            setGoogleBusy(false);
            if (!resp || resp.error) {
              if (resp?.error !== 'popup_closed' && resp?.error !== 'access_denied') {
                setError('Google sign-in was interrupted. Please try again.');
              }
              return;
            }
            try {
              const user = await signInWithGoogle(resp.access_token);
              onSignedIn(user);
            } catch (e) {
              setError(e.message || 'Google sign-in failed.');
            }
          },
        });
        setGoogleReady(true);
      })
      .catch(() => { /* Google sign-in just won't be available; email OTP still works */ });
    return () => { cancelled = true; };
  }, [onSignedIn]);

  const startGoogleSignIn = () => {
    setError(null);
    setGoogleBusy(true);
    tokenClientRef.current?.requestAccessToken();
  };

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const sendCode = async (e) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      await requestOtp(email.trim().toLowerCase());
      setStage('code');
      setResendIn(45);
    } catch (err) {
      setError(err.message || 'Could not send a code.');
    } finally {
      setSending(false);
    }
  };

  const confirmCode = async (e) => {
    e.preventDefault();
    setError(null);
    setVerifying(true);
    try {
      const user = await verifyOtp(email.trim().toLowerCase(), code.trim());
      onSignedIn(user);
    } catch (err) {
      setError(err.message || 'Wrong code.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <h1 className="text-center text-xl font-semibold text-slate-800 dark:text-slate-100">Let's Connect</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Sign in with your CUTM campus email</p>

        <div className="mt-6 flex justify-center">
          {googleReady ? (
            <button
              type="button"
              onClick={startGoogleSignIn}
              disabled={googleBusy}
              className="flex w-80 max-w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.86.92 7.51 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              {googleBusy ? 'Signing in…' : 'Sign in with Google'}
            </button>
          ) : (
            <p className="text-center text-xs text-slate-400">Loading Google sign-in…</p>
          )}
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          <span className="text-xs text-slate-400">or</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>

        {stage === 'email' ? (
          <form onSubmit={sendCode} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@cutm.ac.in"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Email me a code'}
            </button>
          </form>
        ) : (
          <form onSubmit={confirmCode} className="space-y-3">
            <p className="text-center text-xs text-slate-500">
              Code sent to <span className="font-medium text-slate-700 dark:text-slate-200">{email}</span>
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
              maxLength={6}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={verifying}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {verifying ? 'Verifying…' : 'Sign in'}
            </button>
            <div className="flex justify-between text-xs">
              <button type="button" onClick={() => { setStage('email'); setCode(''); setError(null); }} className="text-slate-400 hover:text-slate-600">
                Use a different email
              </button>
              <button
                type="button"
                disabled={resendIn > 0}
                onClick={sendCode}
                className="text-blue-600 hover:text-blue-700 disabled:text-slate-300"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        {error && <p role="alert" className="mt-4 text-center text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
