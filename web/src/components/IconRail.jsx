import React, { useState } from 'react';
import Avatar from './Avatar';
import { getThemeMode, setThemeMode } from '../lib/theme';

/**
 * The app's own persistent left icon rail — a slim column of top-level
 * destinations, always visible next to the chat list. Same *idea* as a
 * desktop chat app's rail (a fixed set of icons for jumping between global
 * views), but our own item set and our own color language (the blue this
 * app already uses everywhere, not borrowed from anyone else's palette).
 */
export default function IconRail({
  user, filter, onChangeFilter, onOpenMentions, mentionsUnread, onOpenAdmin, onOpenProfile, isAdmin,
}) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark';
    setThemeMode(next);
    setDark(!dark);
  };

  return (
    <nav
      aria-label="Primary"
      className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 py-3 md:flex"
    >
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-black text-white shadow-lg shadow-blue-900/40">
        LC
      </div>

      <RailButton
        label="Home"
        active={filter === 'all'}
        onClick={() => onChangeFilter('all')}
        icon={
          <path d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" />
        }
      />
      <RailButton
        label="DMs"
        active={filter === 'dms'}
        onClick={() => onChangeFilter('dms')}
        icon={
          <>
            <circle cx="12" cy="8" r="3.2" />
            <path d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" />
          </>
        }
      />
      <RailButton
        label="Activity"
        active={false}
        badge={mentionsUnread > 0 ? (mentionsUnread > 9 ? '9+' : mentionsUnread) : null}
        onClick={onOpenMentions}
        icon={
          <>
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </>
        }
      />

      {isAdmin && (
        <RailButton
          label="Admin"
          active={false}
          onClick={onOpenAdmin}
          icon={<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />}
        />
      )}

      <div className="mt-auto flex flex-col items-center gap-1">
        <button
          onClick={toggleTheme}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          {dark ? (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
            </svg>
          )}
        </button>
        <button onClick={onOpenProfile} title="Your profile" aria-label="Your profile" className="rounded-full p-0.5 transition hover:ring-2 hover:ring-blue-500/60">
          <Avatar name={user?.name} url={user?.avatarUrl} size={36} />
        </button>
      </div>
    </nav>
  );
}

function RailButton({ label, icon, active, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="group flex w-14 flex-col items-center gap-0.5 py-1"
    >
      <span
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition ${
          active ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40' : 'text-slate-400 group-hover:bg-white/10 group-hover:text-white'
        }`}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {icon}
        </svg>
        {badge != null && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-slate-950">
            {badge}
          </span>
        )}
      </span>
      <span className={`text-[10px] font-medium ${active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
        {label}
      </span>
    </button>
  );
}
