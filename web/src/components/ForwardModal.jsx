import React, { useEffect, useMemo, useState } from 'react';
import Avatar from './Avatar';
import { getHome, sendMessage } from '../api/chat';

/**
 * "Forward this message to anyone" — picks a channel or DM from the same
 * list ChatList already shows, then re-sends the message's text/attachment
 * into that container with a "forwarded" label. No new message type: it's
 * just a normal send with forwardedFromName set.
 */
export default function ForwardModal({ message, onClose, onForwarded }) {
  const [rows, setRows] = useState(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getHome()
      .then((data) => {
        const channels = (data.channels || []).map((c) => ({ id: c.id, kind: 'channel', title: `# ${c.name}` }));
        const dms = (data.dms || []).map((d) => ({ id: d.id, kind: 'dm', title: d.other_user_name }));
        setRows([...channels, ...dms]);
      })
      .catch(() => setRows([]));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.title.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const media = message.attachments && message.attachments[0];

  const forwardTo = async (target) => {
    setBusyId(target.id);
    setError(null);
    try {
      await sendMessage({
        containerId: target.id,
        body: message.text,
        type: message.type === 'text' ? 'text' : message.type,
        mediaUrl: media?.url,
        mediaName: media?.name,
        mediaMimeType: media?.mimeType,
        forwardedFromName: message.sender_name,
      });
      onForwarded?.(target);
    } catch (e) {
      setError(e.message || 'Could not forward that message.');
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-2xl bg-white shadow-xl dark:bg-slate-900"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Forward message</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
        </header>

        <div className="border-b border-slate-200 p-3 dark:border-slate-800">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels and people"
            className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>

        {error && <p role="alert" className="px-4 pt-2 text-xs text-red-600">{error}</p>}

        <div className="flex-1 overflow-y-auto p-2">
          {rows === null && <p className="p-3 text-sm text-slate-400">Loading…</p>}
          {rows !== null && filtered.length === 0 && <p className="p-3 text-sm text-slate-400">No matches.</p>}
          {filtered.map((r) => (
            <button
              key={r.id}
              disabled={busyId === r.id}
              onClick={() => forwardTo(r)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-40 dark:hover:bg-slate-800"
            >
              <Avatar name={r.title} kind={r.kind === 'channel' ? 'channel' : undefined} size={32} />
              <span className="truncate text-sm text-slate-700 dark:text-slate-200">{r.title}</span>
              {busyId === r.id && <span className="ml-auto text-xs text-slate-400">Sending…</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
