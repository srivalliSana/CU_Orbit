import React, { useEffect, useMemo, useState } from 'react';
import Avatar from './Avatar';
import { getHome, sendMessage } from '../api/chat';

/**
 * "Forward this message to anyone" — picks one or more channels/DMs from
 * the same list ChatList shows, then a separate Send step actually
 * re-sends the message's text/attachment into each with a "forwarded"
 * label. Selecting a target no longer sends immediately — that was too
 * easy to trigger by accident with no way back.
 */
export default function ForwardModal({ message, onClose, onForwarded }) {
  const [rows, setRows] = useState(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [sending, setSending] = useState(false);
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

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const targets = rows.filter((r) => selected.has(r.id));
      await Promise.all(targets.map((target) => sendMessage({
        containerId: target.id,
        body: message.text,
        type: message.type === 'text' ? 'text' : message.type,
        mediaUrl: media?.url,
        mediaName: media?.name,
        mediaMimeType: media?.mimeType,
        forwardedFromName: message.sender_name,
      })));
      onForwarded?.(targets);
    } catch (e) {
      setError(e.message || 'Could not forward that message.');
      setSending(false);
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
              onClick={() => toggle(r.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${
                selected.has(r.id) ? 'bg-blue-50 dark:bg-slate-800' : ''
              }`}
            >
              <Avatar name={r.title} kind={r.kind === 'channel' ? 'channel' : undefined} size={32} />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{r.title}</span>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-xs text-white ${
                  selected.has(r.id) ? 'border-blue-600 bg-blue-600' : 'border-slate-300 dark:border-slate-600'
                }`}
              >
                {selected.has(r.id) ? '✓' : ''}
              </span>
            </button>
          ))}
        </div>

        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <button
            onClick={send}
            disabled={selected.size === 0 || sending}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? 'Sending…' : selected.size > 0 ? `Send to ${selected.size}` : 'Select where to send'}
          </button>
        </div>
      </div>
    </div>
  );
}
