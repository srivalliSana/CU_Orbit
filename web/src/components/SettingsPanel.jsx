import React, { useState } from 'react';
import { getThemeMode, setThemeMode } from '../lib/theme';

const THEME_OPTIONS = [
  { value: 'system', label: 'System default' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Theme + privacy settings, shown from the profile panel. */
export default function SettingsPanel({ onClose, onSignOut }) {
  const [mode, setMode] = useState(getThemeMode());

  const choose = (value) => {
    setThemeMode(value);
    setMode(value);
  };

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
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

        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Privacy</h3>
        <div className="mt-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-sm text-slate-700 dark:text-slate-200">Profile visibility: Campus directory</p>
          <p className="mt-2 text-xs text-slate-500">
            Your name, avatar, and status are visible to other CU Orbit users in
            your channels and DMs. Your CampusOne email is only shown to people
            you message directly.
          </p>
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
