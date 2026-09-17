import React from 'react';
import Avatar from './Avatar';

/**
 * IconRail's mobile equivalent — IconRail is `hidden` below the md
 * breakpoint entirely, which used to mean Search/Threads/Activity/Admin/
 * Profile were all unreachable on a phone-width browser, not just
 * differently laid out. This is a real navigation surface, not a cosmetic
 * add-on: Home/Search/Activity/You, matching the native app's own bottom
 * tab bar. Threads and Admin move into the Profile ("You") screen on
 * mobile instead of getting their own tab — four items is what fits
 * comfortably at phone width.
 */
export default function MobileBottomNav({ user, onOpenSearch, onOpenMentions, mentionsUnread, onOpenProfile, onGoHome }) {
  return (
    <nav
      aria-label="Primary"
      className="flex h-14 shrink-0 items-center justify-around border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:hidden"
    >
      <Item label="Home" onClick={onGoHome}>
        <path d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" />
      </Item>
      <Item label="Search" onClick={onOpenSearch}>
        <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
      </Item>
      <Item label="Activity" badge={mentionsUnread > 0 ? (mentionsUnread > 9 ? '9+' : mentionsUnread) : null} onClick={onOpenMentions}>
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </Item>
      <button onClick={onOpenProfile} className="flex flex-1 flex-col items-center gap-0.5 py-1.5" aria-label="You">
        <Avatar name={user?.name} url={user?.avatarUrl} size={24} />
        <span className="text-[10px] font-medium text-slate-500">You</span>
      </button>
    </nav>
  );
}

function Item({ label, onClick, badge, children }) {
  return (
    <button onClick={onClick} className="flex flex-1 flex-col items-center gap-0.5 py-1.5" aria-label={label}>
      <span className="relative">
        <svg
          width="21" height="21" viewBox="0 0 24 24" fill="none"
          stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="text-slate-500 dark:text-slate-400"
          aria-hidden="true"
        >
          {children}
        </svg>
        {badge != null && (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
            {badge}
          </span>
        )}
      </span>
      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{label}</span>
    </button>
  );
}
