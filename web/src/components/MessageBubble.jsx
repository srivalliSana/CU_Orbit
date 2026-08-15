import React, { useMemo, useState } from 'react';
import { clockLabel } from '../lib/format';
import { linkify } from '../lib/linkify';
import { deleteMessage, editMessage, getReads, reactToMessage, setMessagePinned } from '../api/chat';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/** Read receipt: one tick sent, two delivered, two blue read. */
function Ticks({ status }) {
  if (status === 'read') return <span className="text-sky-300" aria-label="Read">✓✓</span>;
  if (status === 'delivered') return <span className="opacity-70" aria-label="Delivered">✓✓</span>;
  return <span className="opacity-70" aria-label="Sent">✓</span>;
}

export default function MessageBubble({ message, own, showSender, isGroup, canModerate, isSuperAdmin, onChanged }) {
  const m = message;
  const [reads, setReads] = useState(null);   // null = not requested
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(m.text || '');
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  const reactionCounts = useMemo(() => {
    const counts = new Map();
    for (const r of m.reactions || []) counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1);
    return [...counts.entries()];
  }, [m.reactions]);

  // "Seen by" is fetched on demand rather than with every message: a group
  // transcript would otherwise issue one request per bubble on every poll.
  const showReads = async () => {
    if (!own || !isGroup || m.pending) return;
    if (reads) { setReads(null); return; }
    try {
      setReads(await getReads(m.id));
    } catch {
      setReads({ read_count: 0, audience: 0, readers: [], error: true });
    }
  };

  const react = async (emoji) => {
    setMenuOpen(false);
    try { await reactToMessage(m.id, emoji); onChanged?.(); } catch { /* best-effort */ }
  };

  const togglePin = async () => {
    setMenuOpen(false);
    setBusy(true);
    try { await setMessagePinned(m.id, !m.is_pinned); onChanged?.(); } finally { setBusy(false); }
  };

  const remove = async () => {
    setMenuOpen(false);
    setBusy(true);
    try { await deleteMessage(m.id); onChanged?.(); } finally { setBusy(false); }
  };

  const saveEdit = async () => {
    const body = editText.trim();
    if (!body || body === m.text) { setEditing(false); return; }
    setBusy(true);
    try {
      await editMessage(m.id, body);
      onChanged?.();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (m.type === 'system') {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-slate-200 px-3 py-1 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {m.text}
        </span>
      </div>
    );
  }

  const media = (m.attachments && m.attachments[0]) || (m.media_url ? { url: m.media_url, type: m.type } : null);
  // The server stores files under a timestamp-prefixed name to avoid disk
  // collisions — attachments[0].name is the sender's real filename.
  const fileName = media?.name || media?.url?.split('/').pop() || 'file';
  // "SUPERADMIN: edit any message" / "ADMIN: cannot edit others' messages" —
  // edit override is admin-only, unlike delete which channel admins share.
  const canEdit = (own || isSuperAdmin) && m.type === 'text' && !m.pending;
  const canDelete = (own || canModerate) && !m.pending;

  return (
    <div className={`group mb-1.5 flex ${own ? 'justify-end' : 'justify-start'}`}>
      <div className={`relative max-w-[75%] ${own ? 'order-2' : ''}`}>
        {m.is_pinned && (
          <p className="mb-0.5 text-[10px] font-medium text-slate-400">📌 Pinned</p>
        )}

        {!m.pending && (
          <div
            className={`absolute -top-3 z-10 hidden items-center gap-0.5 rounded-full bg-white p-0.5 text-xs shadow ring-1 ring-slate-200 group-hover:flex dark:bg-slate-800 dark:ring-slate-700 ${
              own ? 'right-2' : 'left-2'
            }`}
          >
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-full px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-700"
              title="React"
            >
              😀
            </button>
            <button
              onClick={togglePin}
              disabled={busy}
              className="rounded-full px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
              title={m.is_pinned ? 'Unpin' : 'Pin'}
            >
              📌
            </button>
            {canEdit && (
              <button
                onClick={() => { setEditText(m.text); setEditing(true); }}
                className="rounded-full px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Edit"
              >
                ✏️
              </button>
            )}
            {canDelete && (
              <button
                onClick={remove}
                disabled={busy}
                className="rounded-full px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
                title="Delete"
              >
                🗑️
              </button>
            )}
          </div>
        )}

        {menuOpen && (
          <div
            className={`absolute -top-11 z-20 flex items-center gap-1 rounded-full bg-white p-1.5 shadow ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 ${
              own ? 'right-2' : 'left-2'
            }`}
          >
            {QUICK_EMOJIS.map((e) => (
              <button key={e} onClick={() => react(e)} className="text-lg hover:scale-110">
                {e}
              </button>
            ))}
          </div>
        )}

        <div
          onClick={showReads}
          className={`rounded-2xl px-3 py-2 shadow-sm ${own && isGroup && !m.pending ? 'cursor-pointer' : ''} ${
            own
              ? 'rounded-br-md bg-blue-600 text-white'
              : 'rounded-bl-md bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100'
          } ${m.pending ? 'opacity-60' : ''}`}
        >
          {showSender && !own && (
            <p className="mb-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">{m.sender_name}</p>
          )}

          {media && m.type === 'image' && (
            <img
              src={media.url}
              alt={m.text || 'Shared image'}
              loading="lazy"
              onClick={(e) => { e.stopPropagation(); setLightbox(true); }}
              className="mb-1 max-h-80 w-full cursor-zoom-in rounded-lg object-cover"
            />
          )}

          {media && m.type === 'video' && (
            // controls includes the browser's own fullscreen button — no
            // extra lightbox needed, unlike images which have no native one.
            <video
              controls
              src={media.url}
              onClick={(e) => e.stopPropagation()}
              className="mb-1 max-h-80 w-full rounded-lg bg-black"
            />
          )}

          {media && m.type === 'voice' && (
            <audio controls src={media.url} className="mb-1 w-56 max-w-full" />
          )}

          {media && m.type === 'file' && (
            <div className="mb-1" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                📎 <span className="truncate">{fileName}</span>
              </div>
              <div className="mt-1 flex gap-3 text-xs">
                <a href={media.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Open
                </a>
                {/* The file is stored on disk under a timestamp-prefixed name to
                    avoid collisions — the download attribute is what makes the
                    saved copy use the sender's real filename instead of that. */}
                <a href={media.url} download={fileName} className="underline underline-offset-2">
                  Save as
                </a>
              </div>
            </div>
          )}

          {editing ? (
            <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-1.5">
              <textarea
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full resize-none rounded-lg bg-white/90 px-2 py-1 text-sm text-slate-800 outline-none"
                rows={2}
              />
              <div className="flex justify-end gap-2 text-[11px]">
                <button onClick={() => setEditing(false)} className="opacity-80 hover:opacity-100">Cancel</button>
                <button onClick={saveEdit} disabled={busy} className="font-semibold opacity-90 hover:opacity-100">Save</button>
              </div>
            </div>
          ) : (
            m.text ? (
              <p className="whitespace-pre-wrap break-words text-sm">
                {linkify(m.text, own ? 'underline underline-offset-2 text-blue-100' : 'underline underline-offset-2 text-blue-600 dark:text-blue-400')}
              </p>
            ) : null
          )}

          <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${own ? 'text-blue-100' : 'text-slate-400'}`}>
            {m.edited_at ? <span className="italic">edited</span> : null}
            <span>{clockLabel(m.sent_at)}</span>
            {own ? <Ticks status={m.status} /> : null}
          </div>

          {reactionCounts.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
              {reactionCounts.map(([emoji, count]) => (
                <button
                  key={emoji}
                  onClick={() => react(emoji)}
                  className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                    own ? 'bg-blue-500/40' : 'bg-slate-100 dark:bg-slate-700'
                  }`}
                >
                  {emoji} {count > 1 ? count : ''}
                </button>
              ))}
            </div>
          )}

          {reads && (
            <div className={`mt-1.5 border-t pt-1.5 text-[10px] ${own ? 'border-blue-500/40 text-blue-100' : 'border-slate-200 text-slate-500'}`}>
              {reads.error ? (
                <span>Couldn’t load read receipts</span>
              ) : (
                <>
                  <span className="font-medium">
                    Read by {reads.read_count}{reads.audience ? ` of ${reads.audience}` : ''}
                  </span>
                  {reads.readers.length > 0 && (
                    <span className="ml-1">· {reads.readers.map((r) => r.name).join(', ')}</span>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {lightbox && media && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(false)}
        >
          <img src={media.url} alt={m.text || 'Shared image'} className="max-h-full max-w-full object-contain" />
          <button
            onClick={() => setLightbox(false)}
            aria-label="Close"
            className="absolute right-4 top-4 text-2xl text-white/80 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
