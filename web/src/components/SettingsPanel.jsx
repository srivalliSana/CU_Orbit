import React, { useEffect, useState } from 'react';
import Avatar from './Avatar';
import { getThemeMode, setThemeMode } from '../lib/theme';
import { setDoNotDisturb } from '../api/chat';
import { getBlockedUsers, unblockUser, updateProfile } from '../api/users';
import { confirmTwoFactorEnroll, disableTwoFactor, startTwoFactorEnroll } from '../api/auth';

const THEME_OPTIONS = [
  { value: 'system', label: 'System default' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const DND_OPTIONS = [
  { minutes: 60, label: 'For 1 hour' },
  { minutes: 480, label: 'For 8 hours' },
  { minutes: 1440, label: 'Until tomorrow' },
];

/** Theme + notifications + privacy settings, shown from the profile panel. */
export default function SettingsPanel({ user, onClose, onSignOut, onUpdated }) {
  const [mode, setMode] = useState(getThemeMode());
  const [dndBusy, setDndBusy] = useState(false);
  const [digestBusy, setDigestBusy] = useState(false);
  const [twofaStage, setTwofaStage] = useState('idle');   // idle | enrolling | busy
  const [twofaCode, setTwofaCode] = useState('');
  const [twofaError, setTwofaError] = useState(null);

  const [blocked, setBlocked] = useState(null);
  useEffect(() => { getBlockedUsers().then(setBlocked).catch(() => setBlocked([])); }, []);

  const unblock = async (id) => {
    await unblockUser(id).catch(() => {});
    setBlocked((rows) => rows?.filter((r) => r.id !== id) ?? rows);
  };

  const startTwofaEnroll = async () => {
    setTwofaError(null);
    setTwofaStage('busy');
    try {
      await startTwoFactorEnroll();
      setTwofaStage('enrolling');
    } catch (e) {
      setTwofaError(e.message || 'Could not send a code.');
      setTwofaStage('idle');
    }
  };

  const confirmTwofaEnroll = async (e) => {
    e.preventDefault();
    setTwofaError(null);
    setTwofaStage('busy');
    try {
      const updated = await confirmTwoFactorEnroll(twofaCode.trim());
      onUpdated?.(updated);
      setTwofaStage('idle');
      setTwofaCode('');
    } catch (e) {
      setTwofaError(e.message || 'Wrong code.');
      setTwofaStage('enrolling');
    }
  };

  const turnOffTwofa = async () => {
    setTwofaError(null);
    setTwofaStage('busy');
    try {
      const updated = await disableTwoFactor();
      onUpdated?.(updated);
    } catch (e) {
      setTwofaError(e.message || 'Could not turn off two-factor authentication.');
    } finally {
      setTwofaStage('idle');
    }
  };

  const toggleDigest = async () => {
    setDigestBusy(true);
    try {
      const updated = await updateProfile({ email_digest_opt_out: !user?.email_digest_opt_out });
      onUpdated?.(updated);
    } finally {
      setDigestBusy(false);
    }
  };

  const choose = (value) => {
    setThemeMode(value);
    setMode(value);
  };

  const dndUntil = user?.dnd_until ? new Date(user.dnd_until) : null;
  const dndActive = dndUntil && dndUntil.getTime() > Date.now();

  const applyDnd = async (minutes) => {
    setDndBusy(true);
    try {
      const { dnd_until } = await setDoNotDisturb(minutes);
      onUpdated?.({ ...user, dnd_until });
    } finally {
      setDndBusy(false);
    }
  };

  return (
    <aside className="fixed inset-0 z-30 flex w-full flex-col bg-white dark:bg-slate-900 md:static md:z-auto md:w-full md:max-w-sm md:shrink-0 md:border-l md:border-slate-200 md:dark:border-slate-800">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Settings</h2>
        <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Theme</h3>
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          {THEME_OPTIONS.map((opt, i) => (
            <button
              key={opt.value}
              onClick={() => choose(opt.value)}
              className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                i > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''
              }`}
            >
              <span className="text-slate-700 dark:text-slate-200">{opt.label}</span>
              {mode === opt.value && <span className="text-blue-600">✓</span>}
            </button>
          ))}
        </div>

        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Notifications</h3>
        <div className="mt-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-700 dark:text-slate-200">Do not disturb</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {dndActive
                  ? `Paused until ${dndUntil.toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}`
                  : 'All push notifications on this account are on.'}
              </p>
            </div>
            {dndActive && (
              <button
                onClick={() => applyDnd(0)}
                disabled={dndBusy}
                className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
              >
                Turn off
              </button>
            )}
          </div>
          {!dndActive && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {DND_OPTIONS.map((opt) => (
                <button
                  key={opt.minutes}
                  onClick={() => applyDnd(opt.minutes)}
                  disabled={dndBusy}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Individual channels and DMs can be muted from their row in the sidebar.
          </p>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div>
              <p className="text-sm text-slate-700 dark:text-slate-200">Email digest</p>
              <p className="mt-0.5 text-xs text-slate-500">
                A daily email summarizing unread mentions and messages, only when there's something to report.
              </p>
            </div>
            <button
              onClick={toggleDigest}
              disabled={digestBusy}
              role="switch"
              aria-checked={!user?.email_digest_opt_out}
              aria-label="Email digest"
              className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
                user?.email_digest_opt_out ? 'bg-slate-300 dark:bg-slate-700' : 'bg-blue-600'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                  user?.email_digest_opt_out ? 'left-0.5' : 'left-[22px]'
                }`}
              />
            </button>
          </div>
        </div>

        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Security</h3>
        <div className="mt-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-700 dark:text-slate-200">Two-factor authentication</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {user?.twofa_enabled
                  ? 'On — signing in with Google also asks for an emailed code.'
                  : 'Adds a second emailed code when signing in with Google.'}
              </p>
            </div>
            {user?.twofa_enabled ? (
              <button
                onClick={turnOffTwofa}
                disabled={twofaStage === 'busy'}
                className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
              >
                Turn off
              </button>
            ) : twofaStage === 'idle' ? (
              <button
                onClick={startTwofaEnroll}
                className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                Turn on
              </button>
            ) : null}
          </div>
          {twofaStage === 'enrolling' && (
            <form onSubmit={confirmTwofaEnroll} className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={twofaCode}
                onChange={(e) => setTwofaCode(e.target.value)}
                placeholder="6-digit code"
                maxLength={6}
                className="min-w-0 flex-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
              />
              <button
                type="submit"
                disabled={!twofaCode.trim()}
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Confirm
              </button>
              <button type="button" onClick={() => setTwofaStage('idle')} className="shrink-0 text-xs text-slate-400 hover:text-slate-600">
                Cancel
              </button>
            </form>
          )}
          {twofaError && <p className="mt-2 text-xs text-red-600">{twofaError}</p>}
        </div>

        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Privacy</h3>
        <div className="mt-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-sm text-slate-700 dark:text-slate-200">Profile visibility: Campus directory</p>
          <p className="mt-2 text-xs text-slate-500">
            Your name, avatar, and status are visible to other Let's Connect users in
            your channels and DMs. Your CampusOne email is only shown to people
            you message directly.
          </p>
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="text-sm text-slate-700 dark:text-slate-200">Blocked</p>
            {blocked === null ? (
              <p className="mt-1 text-xs text-slate-400">Loading…</p>
            ) : blocked.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">Nobody's blocked. Block someone from their profile card.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {blocked.map((b) => (
                  <li key={b.id} className="flex items-center gap-2.5">
                    <Avatar name={b.name} url={b.avatarUrl} size={28} />
                    <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{b.name}</span>
                    <button onClick={() => unblock(b.id)} className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-700">
                      Unblock
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <button
          onClick={onSignOut}
          className="mt-6 w-full rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
