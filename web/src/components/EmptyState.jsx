import React from 'react';

/** Right pane before a conversation is chosen. */
export default function EmptyState({ user, onNewGroup }) {
  return (
    <section className="hidden flex-1 items-center justify-center bg-slate-50 md:flex dark:bg-slate-950">
      <div className="max-w-sm px-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/10">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.8" aria-hidden="true">
            <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {user?.name ? `Welcome, ${user.name.split(' ')[0]}` : 'CU Orbit'}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Pick a channel or a person on the left, or start a new group.
        </p>
        <button
          onClick={onNewGroup}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New group
        </button>
      </div>
    </section>
  );
}
