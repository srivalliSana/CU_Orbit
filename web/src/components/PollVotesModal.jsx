import React from 'react';
import Avatar from './Avatar';

/** Per-option vote breakdown for a poll — opened from the "View votes" link on a poll bubble. */
export default function PollVotesModal({ poll, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{poll.question}</h2>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          {poll.voted_members} of {poll.total_members} member{poll.total_members === 1 ? '' : 's'} voted
        </p>

        <div className="max-h-80 space-y-3 overflow-y-auto">
          {poll.options.map((opt, i) => {
            const count = poll.counts[i] || 0;
            const optionVoters = poll.voters?.[i] || [];
            return (
              <div key={i} className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{opt}</span>
                  <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {count} vote{count === 1 ? '' : 's'}
                  </span>
                </div>
                {optionVoters.length > 0 ? (
                  <div className="space-y-1.5">
                    {optionVoters.map((v) => (
                      <div key={v.id} className="flex items-center gap-2">
                        <Avatar name={v.name} url={v.avatarUrl} size={22} />
                        <span className="truncate text-xs text-slate-600 dark:text-slate-300">{v.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No votes yet</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
