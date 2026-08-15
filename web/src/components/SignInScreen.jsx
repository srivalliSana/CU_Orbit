import React, { useEffect, useRef, useState } from 'react';
import { getConfig, requestOtp, signInWithGoogle, verifyOtp } from '../api/auth';

/** Shown when there is no valid session — Google or email-OTP sign-in, gated to a CUTM campus email. */
export default function SignInScreen({ onSignedIn }) {
  const [googleReady, setGoogleReady] = useState(false);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const buttonRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getConfig()
      .then(async (cfg) => {
        if (cancelled || !cfg.google_web_client_id) return;
        // The GIS script tag in index.html loads async — poll briefly rather
        // than assuming it has landed by the time this effect runs.
        for (let i = 0; i < 40 && !window.google?.accounts?.id; i++) {
          await new Promise((r) => setTimeout(r, 100));
        }
        if (cancelled || !window.google?.accounts?.id) return;

        window.google.accounts.id.initialize({
          client_id: cfg.google_web_client_id,
          callback: async (resp) => {
            try {
              const user = await signInWithGoogle(resp.credential);
              onSignedIn(user);
            } catch (e) {
              setError(e.message || 'Google sign-in failed.');
            }
          },
        });
        if (buttonRef.current) {
          window.google.accounts.id.renderButton(buttonRef.current, {
            theme: 'outline', size: 'large', width: 320, text: 'signin_with',
          });
        }
        setGoogleReady(true);
      })
      .catch(() => { /* Google button just won't render; email OTP still works */ });
    return () => { cancelled = true; };
  }, [onSignedIn]);

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
        <h1 className="text-center text-xl font-semibold text-slate-800 dark:text-slate-100">CU Orbit</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Sign in with your CUTM campus email</p>

        <div className="mt-6 flex justify-center" ref={buttonRef} />
        {!googleReady && (
          <p className="mt-2 text-center text-xs text-slate-400">Loading Google sign-in…</p>
        )}

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
