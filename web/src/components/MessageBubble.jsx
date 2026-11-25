import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clockLabel } from '../lib/format';
import { renderInlineText, renderMessageText } from '../lib/markdown';
import { deleteMessage, editMessage, getReads, hideMessage, reactToMessage, sendMessageAction, setMessagePinned, starMessage, unstarMessage, votePoll } from '../api/chat';
import Avatar from './Avatar';
import EmojiPicker, { useCustomEmojiMap } from './EmojiPicker';
import PollVotesModal from './PollVotesModal';
import LinkPreviewCard from './LinkPreviewCard';
import AddToListModal from './AddToListModal';
import { saveFile } from '../lib/saveFile';
import { reportUser } from '../api/users';
import { burstConfetti } from '../lib/confetti';
import { absoluteMediaUrl } from '../utils/mediaUrl';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// Replaces the old emoji-as-icon menu rows (↩️📋➡️...) with a real stroke-icon
// set — emoji render inconsistently across OSes/fonts and read as decoration
// rather than a meaningful glyph for the action.
const MENU_ICON_PATHS = {
  reply: 'M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5V20',
  forward: 'M15 14l5-5-5-5 M20 9H9.5A5.5 5.5 0 0 0 4 14.5V20',
  copy: 'M9 9h11v11H9z M5 15H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1',
  select: 'M5 12l4 4L19 6',
  pin: 'M9 4h6l-.5 6L17 12v2H7v-2l2.5-2Z M12 14v6',
  star: 'M12 4l2.4 5.1 5.6.6-4.2 3.8 1.2 5.5L12 16.7 6.9 19l1.3-5.5-4.2-3.8 5.6-.6Z',
  starFilled: 'M12 4l2.4 5.1 5.6.6-4.2 3.8 1.2 5.5L12 16.7 6.9 19l1.3-5.5-4.2-3.8 5.6-.6Z',
  flag: 'M6 4v16 M6 5h11l-2.5 3.5L17 12H6',
  list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  edit: 'M4 20l1-4.5L16 4.5 19.5 8 8.5 19Z M14 6.5 17.5 10',
  trash: 'M5 7h14 M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2 M7 7l1 13h8l1-13',
};

/** Small stroke icon for a menu row — see MENU_ICON_PATHS. */
function MenuIcon({ name, filled }) {
  const d = MENU_ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : `M${seg}`} />
      ))}
    </svg>
  );
}

/** One row in the message actions dropdown — icon, label, optional danger styling. */
function MenuItem({ icon, iconFilled, label, onClick, disabled, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm disabled:opacity-40 ${
        danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      <span className="flex w-4 justify-center">
        <MenuIcon name={icon} filled={iconFilled} />
      </span>
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

/** A bot's interactive buttons — an "actions" attachment block. Clicking one
 *  forwards the click to the app and, if it responds with new text/buttons,
 *  updates in place (the click both fires the interaction and refreshes). */
function ActionButtons({ message: m, own, onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const block = (m.attachments || []).find((a) => a.type === 'actions');
  if (!block?.buttons?.length) return null;

  const click = async (button) => {
    setBusyId(button.action_id);
    try {
      await sendMessageAction(m.id, button.action_id, button.value);
      onChanged?.();
    } catch { /* best-effort */ } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
      {block.buttons.map((b) => (
        <button
          key={b.action_id}
          onClick={() => click(b)}
          disabled={busyId === b.action_id}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
            b.style === 'danger'
              ? 'bg-red-600 text-white hover:bg-red-700'
              : b.style === 'primary'
              ? 'bg-accent-600 text-white hover:bg-accent-700'
              : own
              ? 'bg-white/20 text-white hover:bg-white/30'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200'
          }`}
        >
          {busyId === b.action_id ? '…' : b.text}
        </button>
      ))}
    </div>
  );
}

export default function MessageBubble({
  message, own, showSender, isGroup, canModerate, isSuperAdmin, onChanged,
  onReply, onForward, onOpenProfile, currentUserId, onOpenDm, onJumpToMessage,
  selectionMode, selected, onEnterSelection, onToggleSelect,
}) {
  const m = message;
  const [reads, setReads] = useState(null);   // null = not requested
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsFlip, setActionsFlip] = useState('up');
  const actionsTriggerRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(m.text || '');
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  // Lightbox zoom/pan — Slack's image viewer supports both, this didn't
  // support either (fit-to-screen only). zoom resets whenever the viewer
  // (re)opens; pan only matters once zoomed in.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef(null);
  useEffect(() => { if (lightbox) { setZoom(1); setPan({ x: 0, y: 0 }); } }, [lightbox]);
  const clampZoom = (z) => Math.min(4, Math.max(1, z));
  const zoomBy = (delta) => setZoom((z) => {
    const next = clampZoom(z + delta);
    if (next === 1) setPan({ x: 0, y: 0 });
    return next;
  });
  const onWheelZoom = (e) => { e.preventDefault(); zoomBy(-e.deltaY * 0.0015); };
  const onImagePointerDown = (e) => {
    e.stopPropagation(); // don't let the overlay's click-to-close fire
    if (zoom === 1) return;
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const onImagePointerMove = (e) => {
    if (!panStart.current) return;
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
  };
  const onImagePointerUp = () => { panStart.current = null; };
  const [linkCopied, setLinkCopied] = useState(false);
  const [starred, setStarred] = useState(!!m.is_starred);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const [addingToList, setAddingToList] = useState(false);
  const [viewingVotes, setViewingVotes] = useState(false);
  const customEmojiMap = useCustomEmojiMap();

  const reactionCounts = useMemo(() => {
    const counts = new Map();
    for (const r of m.reactions || []) counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1);
    return [...counts.entries()];
  }, [m.reactions]);

  // "Seen by" is fetched on demand rather than with every message: a group
  // transcript would otherwise issue one request per bubble on every poll.
  const showReads = async () => {
    if (!own || !isGroup || m.pending || selectionMode) return;
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

  const reportMessage = async () => {
    setActionsOpen(false);
    const reason = window.prompt(`Report this message from ${m.sender_name}? Add a reason (optional):`);
    if (reason === null) return;   // cancelled
    try { await reportUser(m.sender_id, reason, m.id); } catch { /* best-effort */ }
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

  const pollRef = useRef(null);

  const vote = async (optionIndex) => {
    // A quiz is answer-once: no toggling off or switching after you've
    // committed, unlike an ordinary poll.
    if (m.poll?.quiz_mode && (m.poll.my_votes || []).length > 0) return;
    setBusy(true);
    try {
      const result = await votePoll(m.poll.id, optionIndex);
      if (result?.quiz_mode && result.my_correct) burstConfetti(pollRef.current);
      onChanged?.();
    } finally { setBusy(false); }
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
    <div className={`group mb-1.5 flex items-end gap-2 ${own ? 'justify-end' : 'justify-start'}`}>
      {showSender && !own && (
        <Avatar name={m.sender_name} url={m.sender_avatar_url} size={30} />
      )}
      {selectionMode && (
        <button
          onClick={() => onToggleSelect?.()}
          aria-label={selected ? 'Deselect message' : 'Select message'}
          className={`flex h-5 w-5 shrink-0 items-center justify-center self-center rounded-full border-2 text-xs text-white ${own ? 'order-2' : ''} ${
            selected ? 'border-accent-600 bg-accent-600' : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
          }`}
        >
          {selected ? '✓' : ''}
        </button>
      )}
      <div
        onClick={selectionMode ? () => onToggleSelect?.() : undefined}
        className={`relative max-w-[75%] ${own ? 'order-2' : ''} ${selectionMode ? 'cursor-pointer' : ''} ${selected ? 'rounded-2xl ring-2 ring-accent-500' : ''}`}
      >
        {m.is_pinned && (
          <p className="mb-0.5 text-[10px] font-medium text-slate-400">📌 Pinned</p>
        )}

        {!m.pending && !selectionMode && (
          <button
            ref={actionsTriggerRef}
            onClick={() => {
              // Open upward by default, but flip down when there isn't
              // ~320px of room above the trigger (the dropdown's rough
              // height) — otherwise it gets clipped by the scroll container
              // for any message near the top of the chat.
              const rect = actionsTriggerRef.current?.getBoundingClientRect();
              setActionsFlip(rect && rect.top < 320 ? 'down' : 'up');
              setActionsOpen((v) => !v);
            }}
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
            className={`absolute z-20 w-44 overflow-hidden rounded-2xl bg-white py-1.5 shadow-xl ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 ${
              // Own messages sit near the chat pane's right edge, so anchoring
              // to their right edge and expanding left is safe. Received
              // messages sit near the left edge — anchoring right there
              // pushed this 176px-wide menu left past the chat pane and
              // under the sidebar, clipping it. Anchor to the bubble's own
              // side instead of always the same side.
              own ? 'right-2' : 'left-2'
            } ${actionsFlip === 'up' ? '-top-2 -translate-y-full' : 'top-6'}`}
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
            <MenuItem icon="reply" label="Reply" onClick={() => { setActionsOpen(false); onReply?.(m); }} />
            {m.text && <MenuItem icon="copy" label="Copy text" onClick={copyText} />}
            {media?.url && (
              <MenuItem
                icon="copy"
                label="Copy link"
                onClick={() => { setActionsOpen(false); navigator.clipboard?.writeText(absoluteMediaUrl(media.url)); }}
              />
            )}
            <MenuItem icon="forward" label="Forward" onClick={() => { setActionsOpen(false); onForward?.(m); }} />
            <MenuItem icon="select" label="Select" onClick={() => { setActionsOpen(false); onEnterSelection?.(); }} />
            <MenuItem icon="pin" label={m.is_pinned ? 'Unpin' : 'Pin'} onClick={togglePin} disabled={busy} />
            <MenuItem icon="star" iconFilled={starred} label={starred ? 'Unstar' : 'Star'} onClick={toggleStar} />
            {!own && <MenuItem icon="flag" label="Report" onClick={reportMessage} />}
            {m.channel_id && (
              <MenuItem icon="list" label="Add to list" onClick={() => { setActionsOpen(false); setAddingToList(true); }} />
            )}
            {canEdit && (
              <MenuItem icon="edit" label="Edit" onClick={() => { setActionsOpen(false); setEditText(m.text); setEditing(true); }} />
            )}
            <MenuItem icon="trash" label="Delete" danger onClick={() => { setActionsOpen(false); setDeleteMenuOpen(true); }} disabled={busy} />
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
                <MenuItem icon="trash" label="Delete for me" onClick={deleteForMe} disabled={busy} />
                {canDelete && (
                  <MenuItem icon="trash" label="Delete for everyone" danger onClick={deleteForEveryone} disabled={busy} />
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

        {addingToList && (
          <AddToListModal channelId={m.channel_id} message={m} onClose={() => setAddingToList(false)} />
        )}

        {emojiPickerOpen && (
          <EmojiPicker
            onPick={(emoji) => { react(emoji); setEmojiPickerOpen(false); }}
            onClose={() => setEmojiPickerOpen(false)}
          />
        )}

        <div
          onClick={showReads}
          onDoubleClick={(e) => { e.stopPropagation(); if (!m.pending && !selectionMode) onReply?.(m); }}
          title="Double-click to reply"
          className={`rounded-2xl px-3 py-2 shadow-sm ${own && isGroup && !m.pending ? 'cursor-pointer' : ''} ${
            own
              ? 'rounded-br-md bg-accent-600 text-white'
              : 'rounded-bl-md bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100'
          } ${m.pending ? 'opacity-60' : ''}`}
        >
          {showSender && !own && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenProfile?.(m.sender_id); }}
              className="mb-0.5 block text-xs font-semibold text-accent-600 hover:underline dark:text-accent-400"
            >
              {m.sender_name}
            </button>
          )}

          {m.forwarded_from && (
            <p className={`mb-0.5 text-[11px] italic ${own ? 'text-accent-100' : 'text-slate-400'}`}>
              ➡️ Forwarded from {m.forwarded_from.sender_name}
            </p>
          )}

          {m.reply_to && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onJumpToMessage?.(m.reply_to.id); }}
              className={`mb-1 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-xs transition hover:brightness-95 ${
                own ? 'border-accent-200 bg-accent-500/30 text-accent-50' : 'border-accent-400 bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              }`}
            >
              <p className="font-semibold">{m.reply_to.sender_name}</p>
              <p className="truncate">{m.reply_to.text ? renderInlineText(m.reply_to.text, own ? 'underline' : 'underline text-accent-600 dark:text-accent-400') : 'Attachment'}</p>
            </button>
          )}

          {m.type === 'poll' && m.poll && (
            <div ref={pollRef} className="mb-1 min-w-[220px]" onClick={(e) => e.stopPropagation()}>
              <p className={`mb-2 text-sm font-semibold ${own ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>
                {m.poll.quiz_mode ? '🎯' : '📊'} {m.poll.question}
              </p>
              <div className="flex flex-col gap-1.5">
                {m.poll.options.map((opt, i) => {
                  const count = m.poll.counts[i] || 0;
                  const pct = m.poll.total_votes ? Math.round((count / m.poll.total_votes) * 100) : 0;
                  const mine = (m.poll.my_votes || []).includes(i);
                  const optionVoters = m.poll.voters?.[i] || [];
                  const shown = optionVoters.slice(0, 3);
                  const extra = optionVoters.length - shown.length;
                  const hasAnswered = m.poll.quiz_mode && (m.poll.my_votes || []).length > 0;
                  const revealed = m.poll.correct_option_index != null;
                  const isCorrectOption = revealed && i === m.poll.correct_option_index;
                  const isMyWrongPick = revealed && mine && !isCorrectOption;
                  const optionImage = m.poll.option_images?.[i];
                  return (
                    <button
                      key={i}
                      disabled={busy || m.poll.closed || hasAnswered}
                      onClick={() => vote(i)}
                      className={`relative overflow-hidden rounded-lg px-2.5 py-1.5 text-left text-xs disabled:opacity-100 ${
                        isCorrectOption
                          ? 'bg-emerald-500/25 ring-1 ring-emerald-500'
                          : isMyWrongPick
                          ? 'bg-red-500/15 ring-1 ring-red-400'
                          : own
                          ? 'bg-accent-500/40'
                          : 'bg-slate-100 dark:bg-slate-700'
                      }`}
                    >
                      {!m.poll.quiz_mode && (
                        <span
                          className={`absolute inset-y-0 left-0 ${own ? 'bg-accent-400/50' : 'bg-accent-500/20'}`}
                          style={{ width: `${pct}%` }}
                        />
                      )}
                      <span className="relative flex items-center gap-2">
                        {optionImage && (
                          <img src={optionImage} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                        )}
                        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                          <span className={`truncate ${mine ? 'font-semibold' : ''}`}>
                            {isCorrectOption ? '✅ ' : isMyWrongPick ? '❌ ' : mine ? '✓ ' : ''}{opt}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {!m.poll.quiz_mode && shown.length > 0 && (
                              <span className="flex items-center">
                                {shown.map((v, vi) => (
                                  <span key={v.id} className={vi > 0 ? '-ml-2' : ''} title={v.name}>
                                    <Avatar name={v.name} url={v.avatarUrl} size={18} />
                                  </span>
                                ))}
                                {extra > 0 && (
                                  <span className="-ml-2 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-slate-400 text-[9px] font-semibold text-white ring-2 ring-white dark:ring-slate-700">
                                    +{extra}
                                  </span>
                                )}
                              </span>
                            )}
                            {(!m.poll.quiz_mode || revealed) && <span className="opacity-70">{count}</span>}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className={`mt-1.5 text-[11px] ${own ? 'text-accent-100' : 'text-slate-400'}`}>
                {m.poll.quiz_mode ? (
                  m.poll.my_correct === true ? '🎉 Correct!' : m.poll.my_correct === false ? 'Not quite — correct answer highlighted' : 'Pick an answer to see if you’re right'
                ) : (
                  <>
                    {m.poll.total_votes} vote{m.poll.total_votes === 1 ? '' : 's'}
                    {m.poll.multiple_choice ? ' · Select one or more' : ' · Select one'}
                  </>
                )}
              </p>
              {m.poll.total_votes > 0 && (
                <button
                  onClick={() => setViewingVotes(true)}
                  className={`mt-1 block w-full text-center text-[11px] font-semibold ${own ? 'text-accent-100 hover:text-white' : 'text-emerald-600 hover:text-emerald-700 dark:text-emerald-400'}`}
                >
                  {m.poll.quiz_mode ? 'View results' : 'View votes'}
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
            m.text && m.type !== 'poll' ? (
              <div className="whitespace-pre-wrap break-words text-sm">
                {renderMessageText(m.text, {
                  linkClassName: own ? 'underline underline-offset-2 text-accent-100' : 'underline underline-offset-2 text-accent-600 dark:text-accent-400',
                  mentions: m.enriched_mentions,
                  onMentionClick: (mention) => {
                    if (!mention.user_id || !currentUserId || mention.user_id === currentUserId) return;
                    const dmId = [currentUserId, mention.user_id].sort().join('_');
                    onOpenDm?.({ id: dmId, kind: 'dm', title: mention.display_name });
                  },
                })}
              </div>
            ) : null
          )}

          {m.text && m.type === 'text' && !editing && <LinkPreviewCard text={m.text} />}

          <ActionButtons message={m} own={own} onChanged={onChanged} />

          <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${own ? 'text-accent-100' : 'text-slate-400'}`}>
            {m.edited_at ? <span className="italic">edited</span> : null}
            <span>{clockLabel(m.sent_at)}</span>
            {own ? <Ticks status={m.status} /> : null}
          </div>

          {reactionCounts.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
              {reactionCounts.map(([emoji, count]) => {
                const names = (m.reactions || []).filter((r) => r.emoji === emoji).map((r) => r.userName).join(', ');
                const customUrl = customEmojiMap.get(emoji);
                return (
                  <button
                    key={emoji}
                    onClick={() => react(emoji)}
                    title={names}
                    className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] ${
                      own ? 'bg-accent-500/40' : 'bg-slate-100 dark:bg-slate-700'
                    }`}
                  >
                    {customUrl ? <img src={customUrl} alt={emoji} className="h-3.5 w-3.5 object-contain" /> : emoji}
                    {count > 1 ? count : ''}
                  </button>
                );
              })}
            </div>
          )}

          {reads && (
            <div className={`mt-1.5 border-t pt-1.5 text-[10px] ${own ? 'border-accent-500/40 text-accent-100' : 'border-slate-200 text-slate-500'}`}>
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
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/90 p-4"
          onClick={() => setLightbox(false)}
          onWheel={onWheelZoom}
        >
          <img
            src={media.url}
            alt={m.text || 'Shared image'}
            draggable={false}
            onPointerDown={onImagePointerDown}
            onPointerMove={onImagePointerMove}
            onPointerUp={onImagePointerUp}
            onPointerLeave={onImagePointerUp}
            className="max-h-full max-w-full select-none object-contain"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: panStart.current ? 'none' : 'transform 0.1s ease-out',
              cursor: zoom > 1 ? 'grab' : 'zoom-in',
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-white backdrop-blur-sm"
          >
            <button onClick={() => zoomBy(-0.5)} aria-label="Zoom out" title="Zoom out" className="flex h-9 w-9 items-center justify-center rounded-full text-lg hover:bg-white/10">−</button>
            <span className="min-w-[3.5rem] text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
            <button onClick={() => zoomBy(0.5)} aria-label="Zoom in" title="Zoom in" className="flex h-9 w-9 items-center justify-center rounded-full text-lg hover:bg-white/10">+</button>
            {zoom !== 1 && (
              <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="Reset zoom" title="Reset zoom" className="ml-1 rounded-full px-2 py-1 text-xs hover:bg-white/10">Reset</button>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(absoluteMediaUrl(media.url)).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1500); }); }}
            aria-label="Copy link"
            title={linkCopied ? 'Copied!' : 'Copy link'}
            className="absolute right-28 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
          >
            {linkCopied ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            )}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); saveFile(media.url, fileName); }}
            aria-label="Save image"
            title="Save image"
            className="absolute right-16 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button
            onClick={() => setLightbox(false)}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
