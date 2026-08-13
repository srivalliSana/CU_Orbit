import React, { useEffect, useState } from 'react';
import { getMentions, markMentionRead } from '../api/mentions';
import { timeLabel } from '../lib/format';

/** Mentions/activity feed, shown as an overlay panel (mirrors ContactPanel's shape). */
export default function MentionsPanel({ onClose, onOpenChat }) {
  const [mentions, setMentions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getMentions()
      .then(setMentions)
      .catch((e) => setError(e.message || 'Could not load mentions.'));
  }, []);

  const open = (m) => {
    if (!m.is_read) markMentionRead(m.id);
    const isDm = m.channel_id.includes('_');
    onOpenChat({ id: m.channel_id, kind: isDm ? 'dm' : 'channel', title: isDm ? m.sender_name : `# ${m.channel_name}` });
    onClose();
  };

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Mentions</h2>
        <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {error && <p role="alert" className="p-4 text-sm text-red-600">{error}</p>}
        {!mentions && !error && <p className="p-4 text-sm text-slate-400">Loading…</p>}
        {mentions && mentions.length === 0 && (
          <p className="p-4 text-sm text-slate-400">No mentions yet.</p>
        )}
        {mentions?.map((m) => (
          <button
            key={m.id}
            onClick={() => open(m)}
            className={`flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60 ${
              !m.is_read ? 'bg-blue-50/60 dark:bg-slate-800/40' : ''
            }`}
          >
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{m.channel_name}</span>
            <span className="line-clamp-2 text-sm text-slate-700 dark:text-slate-200">
              <b>{m.sender_name}:</b> {m.text}
            </span>
            <span className="text-[11px] text-slate-400">{timeLabel(m.sent_at)}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
