import React, { useEffect, useRef, useState } from 'react';
import { searchMessages } from '../api/chat';
import { renderInlineText } from '../lib/markdown';
import { timeLabel } from '../lib/format';

/** A dedicated, full-screen search results view — the sidebar's own search
 *  box stays for quick conversation/people lookup, but message-content
 *  search (which already supports from:/in:/before:/after: server-side)
 *  deserves more room than a ~300px-wide sidebar gives it. Same full-panel
 *  shape as Threads/Lists/Canvas. */
export default function SearchPanel({ onClose, onOpenResult }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const seq = useRef(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); setError(null); setLoading(false); return; }
    const mySeq = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      searchMessages(q)
        .then((rows) => { if (mySeq === seq.current) { setResults(rows); setError(null); } })
        .catch((e) => { if (mySeq === seq.current) setError(e.message || 'Search failed.'); })
        .finally(() => { if (mySeq === seq.current) setLoading(false); });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900">
      <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search messages… try from:priya, in:general, before:2024-01-01"
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
        />
        <button onClick={onClose} aria-label="Close" className="shrink-0 text-slate-400 hover:text-slate-600">✕</button>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-5">
        {query.trim().length > 0 && query.trim().length < 2 && (
          <p className="text-sm text-slate-400">Keep typing — at least 2 characters.</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading && <p className="text-sm text-slate-400">Searching…</p>}
        {!loading && results?.length === 0 && (
          <p className="text-sm text-slate-400">No messages match "{query.trim()}".</p>
        )}
        {!query.trim() && (
          <p className="text-sm text-slate-400">
            Search across every channel and DM you're in. Use <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">from:name</code>,{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">in:channel</code>,{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">before:</code>/<code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">after:</code> to narrow it down.
          </p>
        )}

        <div className="space-y-1.5">
          {results?.map((r) => (
            <button
              key={r.id}
              onClick={() => onOpenResult(r)}
              className="block w-full rounded-xl border border-slate-200 p-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {r.is_dm ? r.container_name || r.sender_name : `# ${r.container_name || 'channel'}`}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">{timeLabel(r.sent_at)}</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200">
                <span className="font-medium">{r.sender_name}: </span>
                {r.text ? renderInlineText(r.text, 'text-blue-600 dark:text-blue-400') : 'Attachment'}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
