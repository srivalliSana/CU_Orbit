import React from 'react';

/** Right pane before a conversation is chosen. */
const CAN_CREATE_GROUPS = ['faculty', 'admin', 'examcell', 'coordinator'];

export default function EmptyState({ user, onNewGroup }) {
  const canCreate = CAN_CREATE_GROUPS.includes(user?.role);
  return (
    <section className="hidden flex-1 items-center justify-center bg-slate-50 md:flex dark:bg-slate-950">
      <div className="max-w-sm px-6 text-center">
        <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-600/25">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" aria-hidden="true">
            <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
          {user?.name ? `Welcome, ${user.name.split(' ')[0]}` : "Let's Connect"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {canCreate ? 'Pick a channel or a person on the left, or start a new group.' : 'Pick a channel or a person on the left to start messaging.'}
        </p>
        {canCreate && <button
          onClick={onNewGroup}
          className="mt-5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700"
        >
          New group
        </button>}
      </div>
    </section>
  );
}
