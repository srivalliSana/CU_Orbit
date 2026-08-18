import React, { useMemo, useState } from 'react';
import { clockLabel } from '../lib/format';
import { linkify } from '../lib/linkify';
import { deleteMessage, editMessage, getReads, hideMessage, reactToMessage, setMessagePinned, starMessage, unstarMessage, votePoll } from '../api/chat';
import EmojiPicker from './EmojiPicker';
import PollVotesModal from './PollVotesModal';
import { saveFile } from '../lib/saveFile';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/** One row in the message actions dropdown — icon, label, optional danger styling. */
function MenuItem({ icon, label, onClick, disabled, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm disabled:opacity-40 ${
        danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      <span className="w-4 text-center">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/** Read receipt: one tick sent, two delivered, two blue read. */
function Ticks({ status }) {
  if (status === 'read') return <span className="text-sky-300" aria-label="Read">✓✓</span>;
  if (status === 'delivered') return <span className="opacity-70" aria-label="Delivered">✓✓</span>;
  return <span className="opacity-70" aria-label="Sent">✓</span>;
}

export default function MessageBubble({
  message, own, showSender, isGroup, canModerate, isSuperAdmin, onChanged,
  onReply, onForward, onOpenProfile,
}) {
  const m = message;
  const [reads, setReads] = useState(null);   // null = not requested
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(m.text || '');
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [starred, setStarred] = useState(!!m.is_starred);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const [viewingVotes, setViewingVotes] = useState(false);

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
    setActionsOpen(false);
    try { await reactToMessage(m.id, emoji); onChanged?.(); } catch { /* best-effort */ }
  };

  const copyText = () => {
    setActionsOpen(false);
    navigator.clipboard?.writeText(m.text || '');
  };

  const togglePin = async () => {
    setActionsOpen(false);
    setBusy(true);
    try { await setMessagePinned(m.id, !m.is_pinned); onChanged?.(); } finally { setBusy(false); }
  };

  const toggleStar = async () => {
    const next = !starred;
    setStarred(next);   // optimistic — starring is private, no need to wait on onChanged's refetch
    try { await (next ? starMessage : unstarMessage)(m.id); } catch { setStarred(!next); }
  };

  const deleteForMe = async () => {
    setDeleteMenuOpen(false);
    setBusy(true);
    try { await hideMessage(m.id); onChanged?.(); } finally { setBusy(false); }
  };

  const deleteForEveryone = async () => {
    setDeleteMenuOpen(false);
    setBusy(true);
    try { await deleteMessage(m.id); onChanged?.(); } finally { setBusy(false); }
  };

  const vote = async (optionIndex) => {
    setBusy(true);
    try { await votePoll(m.poll.id, optionIndex); onChanged?.(); } finally { setBusy(false); }
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
          <button
            onClick={() => setActionsOpen((v) => !v)}
            aria-label="Message actions"
            title="Message actions"
            className={`absolute -top-3 right-2 z-10 hidden h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 shadow ring-1 ring-slate-200 group-hover:flex hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700 ${
              actionsOpen ? 'flex' : ''
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}

        {actionsOpen && (
          <>
          <div className="fixed inset-0 z-10" onClick={() => setActionsOpen(false)} />
          <div
            className="absolute -top-2 right-2 z-20 w-44 -translate-y-full overflow-hidden rounded-2xl bg-white py-1.5 shadow-xl ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
          >
            <div className="flex items-center justify-between px-2 pb-1.5">
              {QUICK_EMOJIS.map((e) => (
                <button key={e} onClick={() => react(e)} className="rounded-full p-1 text-lg hover:scale-110">
                  {e}
                </button>
              ))}
              <button
                onClick={() => { setActionsOpen(false); setEmojiPickerOpen(true); }}
                title="More emojis"
                className="rounded-full p-1 text-base font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
              >
                +
              </button>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-700" />
            <MenuItem icon="↩️" label="Reply" onClick={() => { setActionsOpen(false); onReply?.(m); }} />
            {m.text && <MenuItem icon="📋" label="Copy" onClick={copyText} />}
            <MenuItem icon="➡️" label="Forward" onClick={() => { setActionsOpen(false); onForward?.(m); }} />
            <MenuItem icon="📌" label={m.is_pinned ? 'Unpin' : 'Pin'} onClick={togglePin} disabled={busy} />
            <MenuItem icon={starred ? '⭐' : '☆'} label={starred ? 'Unstar' : 'Star'} onClick={toggleStar} />
            {canEdit && (
              <MenuItem icon="✏️" label="Edit" onClick={() => { setActionsOpen(false); setEditText(m.text); setEditing(true); }} />
            )}
            <MenuItem icon="🗑️" label="Delete" danger onClick={() => { setActionsOpen(false); setDeleteMenuOpen(true); }} disabled={busy} />
          </div>
          </>
        )}

        {deleteMenuOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleteMenuOpen(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-800"
            >
              <p className="px-4 pt-4 text-sm text-slate-500 dark:text-slate-400">Delete this message?</p>
              <div className="mt-2">
                <MenuItem icon="🗑️" label="Delete for me" onClick={deleteForMe} disabled={busy} />
                {canDelete && (
                  <MenuItem icon="🗑️" label="Delete for everyone" danger onClick={deleteForEveryone} disabled={busy} />
                )}
              </div>
              <button
                onClick={() => setDeleteMenuOpen(false)}
                className="w-full border-t border-slate-100 px-4 py-2.5 text-center text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {emojiPickerOpen && (
          <EmojiPicker
            onPick={(emoji) => { react(emoji); setEmojiPickerOpen(false); }}
            onClose={() => setEmojiPickerOpen(false)}
          />
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
            <button
              onClick={(e) => { e.stopPropagation(); onOpenProfile?.(m.sender_id); }}
              className="mb-0.5 block text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              {m.sender_name}
            </button>
          )}

          {m.forwarded_from && (
            <p className={`mb-0.5 text-[11px] italic ${own ? 'text-blue-100' : 'text-slate-400'}`}>
              ➡️ Forwarded from {m.forwarded_from.sender_name}
            </p>
          )}

          {m.reply_to && (
            <div
              className={`mb-1 rounded-lg border-l-2 px-2 py-1 text-xs ${
                own ? 'border-blue-200 bg-blue-500/30 text-blue-50' : 'border-blue-400 bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              }`}
            >
              <p className="font-semibold">{m.reply_to.sender_name}</p>
              <p className="truncate">{m.reply_to.text || 'Attachment'}</p>
            </div>
          )}

          {m.type === 'poll' && m.poll && (
            <div className="mb-1 min-w-[220px]" onClick={(e) => e.stopPropagation()}>
              <p className={`mb-2 text-sm font-semibold ${own ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>
                📊 {m.poll.question}
              </p>
              <div className="flex flex-col gap-1.5">
                {m.poll.options.map((opt, i) => {
                  const count = m.poll.counts[i] || 0;
                  const pct = m.poll.total_votes ? Math.round((count / m.poll.total_votes) * 100) : 0;
                  const mine = (m.poll.my_votes || []).includes(i);
                  return (
                    <button
                      key={i}
                      disabled={busy || m.poll.closed}
                      onClick={() => vote(i)}
                      className={`relative overflow-hidden rounded-lg px-2.5 py-1.5 text-left text-xs disabled:opacity-70 ${
                        own ? 'bg-blue-500/40' : 'bg-slate-100 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`absolute inset-y-0 left-0 ${own ? 'bg-blue-400/50' : 'bg-blue-500/20'}`}
                        style={{ width: `${pct}%` }}
                      />
                      <span className="relative flex items-center justify-between gap-2">
                        <span className={mine ? 'font-semibold' : ''}>{mine ? '✓ ' : ''}{opt}</span>
                        <span className="shrink-0 opacity-70">{pct}%</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className={`mt-1.5 text-[11px] ${own ? 'text-blue-100' : 'text-slate-400'}`}>
                {m.poll.total_votes} vote{m.poll.total_votes === 1 ? '' : 's'}
                {m.poll.multiple_choice ? ' · Select one or more' : ' · Select one'}
              </p>
              {m.poll.total_votes > 0 && (
                <button
                  onClick={() => setViewingVotes(true)}
                  className={`mt-1 block w-full text-center text-[11px] font-semibold ${own ? 'text-blue-100 hover:text-white' : 'text-emerald-600 hover:text-emerald-700 dark:text-emerald-400'}`}
                >
                  View votes
                </button>
              )}
            </div>
          )}

          {viewingVotes && (
            <PollVotesModal poll={m.poll} onClose={() => setViewingVotes(false)} />
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
            <div className="mb-1" onClick={(e) => e.stopPropagation()}>
              {/* controls includes the browser's own fullscreen button */}
              <video controls src={media.url} className="w-full rounded-lg bg-black" style={{ maxHeight: 320 }} />
              <button onClick={() => saveFile(media.url, fileName)} className="mt-1 text-xs underline underline-offset-2">
                Save video
              </button>
            </div>
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
                    avoid collisions — saveFile() is what makes the saved copy
                    use the sender's real filename instead of that. */}
                <button onClick={() => saveFile(media.url, fileName)} className="underline underline-offset-2">
                  Save as
                </button>
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
            onClick={(e) => { e.stopPropagation(); saveFile(media.url, fileName); }}
            aria-label="Save image"
            title="Save image"
            className="absolute right-16 top-4 text-2xl text-white/80 hover:text-white"
          >
            ⬇️
          </button>
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
