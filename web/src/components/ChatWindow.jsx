import React, { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import MessageBubble from './MessageBubble';
import Composer from './Composer';
import ForwardModal from './ForwardModal';
import PollComposerModal from './PollComposerModal';
import { createPoll, getConversationPrefs, getMessages, markConversationRead, sendMessage, setConversationPref, uploadFile } from '../api/chat';
import { cancelScheduledMessage, createScheduledMessage, getScheduledMessages } from '../api/scheduled';
import { getChannelMembers } from '../api/channels';
import { dayLabel, lastSeenLabel } from '../lib/format';
import { join, leave, on, sendTyping } from '../api/socket';
import { WALLPAPERS, wallpaperColor } from '../lib/wallpapers';

// The socket delivers messages; this is only a safety net for a dropped
// connection, so it can be slow.
const POLL_MS = 20000;
const TYPING_TTL_MS = 4000;

export default function ChatWindow({ chat, user, onSent, onOpenContact, onOpenChannelInfo, onOpenLists, onOpenCanvas, onOpenWorkflows, onStartHuddle, onOpenProfile, onOpenDm, onBack, scrollToMessageId, onScrolledToMessage }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState([]);
  const [sendError, setSendError] = useState(null);
  const [canModerate, setCanModerate] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const [ephemeralNotice, setEphemeralNotice] = useState(null);
  const [wallpaper, setWallpaper] = useState(null);
  const [wallpaperPickerOpen, setWallpaperPickerOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const scroller = useRef(null);
  const atBottom = useRef(true);
  const pinned = messages.find((m) => m.is_pinned);

  const jumpToMessage = (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(id);
    setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 1800);
  };

  // Arriving here from the Pinned/Starred/Shared-media list, which lives
  // outside this component (channel/DM info panel) — scroll once the
  // message the caller wants is actually in the DOM.
  useEffect(() => {
    if (!scrollToMessageId || loading) return;
    jumpToMessage(scrollToMessageId);
    onScrolledToMessage?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToMessageId, loading]);

  // "ADMIN: delete messages in own channels (from anyone)" / "SUPERADMIN: any
  // channel, any message" — a workspace admin always qualifies; a channel
  // admin only for the channel they're actually admin of.
  useEffect(() => {
    if (user?.role === 'admin') { setCanModerate(true); return; }
    if (chat.kind !== 'channel') { setCanModerate(false); return; }
    let cancelled = false;
    getChannelMembers(chat.id)
      .then((members) => {
        if (cancelled) return;
        const me = members.find((m) => m.id === user?.id);
        setCanModerate(me?.role === 'admin');
      })
      .catch(() => setCanModerate(false));
    return () => { cancelled = true; };
  }, [chat.id, chat.kind, user?.id, user?.role]);

  // Live updates for this conversation.
  useEffect(() => {
    join(chat.id);
    const offMessage = on('message', (m) => {
      if (m.container_id !== chat.id) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    });
    const offRead = on('read', (r) => {
      if (r.container_id !== chat.id || r.reader_id === user?.id) return;
      // Someone read our messages: turn the ticks blue without a refetch.
      setMessages((prev) => prev.map((m) => (m.sender_id === user?.id ? { ...m, status: 'read' } : m)));
    });
    const offTyping = on('typing', (t) => {
      if (t.containerId !== chat.id || t.userId === user?.id) return;
      setTyping((prev) => {
        const next = prev.filter((x) => x.userId !== t.userId);
        return [...next, { userId: t.userId, userName: t.name, at: Date.now() }];
      });
    });
    // Every viewer's vote counts update live, not just the voter's own screen.
    const offPoll = on('poll-updated', (poll) => {
      setMessages((prev) => prev.map((m) => (m.poll?.id === poll.id ? { ...m, poll } : m)));
    });
    // A slash command's private (ephemeral) reply — never a real Message row,
    // pushed only to whoever ran the command, so it can't ever show up via
    // the normal fetch/poll and can't be seen by anyone else in the channel.
    const offEphemeral = on('ephemeral', (e) => {
      if (e.channel_id !== chat.id) return;
      setEphemeralNotice(e);
    });
    return () => { offMessage(); offRead(); offTyping(); offPoll(); offEphemeral(); leave(chat.id); };
  }, [chat.id, user?.id]);

  // Typing indicators expire on their own; the server never sends a "stopped".
  useEffect(() => {
    const t = setInterval(
      () => setTyping((prev) => prev.filter((x) => Date.now() - (x.at || 0) < TYPING_TTL_MS)),
      1000
    );
    return () => clearInterval(t);
  }, []);

  // Fallback poll, in case the socket is down. refreshMessages is also
  // called directly after a reaction/pin/edit/delete, so those actions show
  // up immediately rather than waiting for the next poll tick.
  const refreshMessages = async () => {
    try { setMessages(await getMessages(chat.id)); } catch { /* keep showing stale data */ }
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await getMessages(chat.id);
        if (alive) { setMessages(data); setLoading(false); }
      } catch { if (alive) setLoading(false); }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [chat.id]);

  // Marking read is tied to the messages actually rendered, not merely to
  // opening the chat, so a receipt means it was on screen.
  //
  // Message.status cannot be the trigger: in a channel it stays 'sent' until
  // everyone has read, so keying off it would re-POST on every poll. Track what
  // we have already reported instead.
  const marked = useRef(new Set());
  useEffect(() => {
    if (!messages.length || document.visibilityState !== 'visible') return;
    const fresh = messages.filter(
      (m) => m.sender_id !== user?.id && !m.pending && !marked.current.has(m.id)
    );
    if (!fresh.length) return;
    fresh.forEach((m) => marked.current.add(m.id));
    markConversationRead(chat.id).then(() => onSent?.());
  }, [messages, chat.id, user?.id]);

  // A different conversation has its own history.
  useEffect(() => { marked.current = new Set(); }, [chat.id]);

  // Only auto-scroll if the reader is already at the bottom, so arriving
  // messages never yank them away from history they are reading.
  useEffect(() => {
    if (atBottom.current && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [messages]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // A different conversation starts with a clean composer, not a stale reply.
  useEffect(() => { setReplyTo(null); setEphemeralNotice(null); }, [chat.id]);

  useEffect(() => {
    setWallpaperPickerOpen(false);
    getConversationPrefs(chat.id)
      .then((p) => setWallpaper(p?.wallpaper || null))
      .catch(() => setWallpaper(null));
  }, [chat.id]);

  async function pickWallpaper(key) {
    setWallpaper(key);
    setWallpaperPickerOpen(false);
    try {
      await setConversationPref(chat.id, 'wallpaper', key);
    } catch {
      // best-effort; local state already reflects the choice
    }
  }

  const [scheduled, setScheduled] = useState([]);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const loadScheduled = () => getScheduledMessages(chat.id).then(setScheduled).catch(() => {});
  useEffect(() => { loadScheduled(); setScheduledOpen(false); }, [chat.id]);

  const handleSchedule = async ({ text, file, enrichedMentions, replyToId, sendAt }) => {
    try {
      let mediaUrl, mediaName, type = 'text';
      const mediaMimeType = file?.type;
      if (file) {
        const up = await uploadFile(file);
        mediaUrl = up.url;
        mediaName = up.name || file.name;
        type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'voice' : 'file';
      }
      await createScheduledMessage({ containerId: chat.id, body: text, type, mediaUrl, mediaName, mediaMimeType, enrichedMentions, replyToId, sendAt });
      loadScheduled();
    } catch (e) {
      setSendError(e.message || 'Could not schedule that message');
    }
  };

  const cancelScheduled = async (id) => {
    await cancelScheduledMessage(id).catch(() => {});
    loadScheduled();
  };

  const handleSend = async ({ text, file, gifUrl, enrichedMentions, replyToId }) => {
    setSendError(null);
    // Optimistic bubble so the UI feels immediate; reconciled by the next poll.
    const temp = {
      id: `pending-${Date.now()}`,
      sender_id: user?.id,
      sender_name: user?.name,
      text,
      sent_at: Date.now(),
      type: 'text',
      pending: true,
    };
    setMessages((m) => [...m, temp]);
    atBottom.current = true;

    try {
      let mediaUrl, mediaName, type = 'text';
      const mediaMimeType = file?.type;
      if (file) {
        const up = await uploadFile(file);
        mediaUrl = up.url;
        mediaName = up.name || file.name;
        type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'voice' : 'file';
      } else if (gifUrl) {
        // GIFs are sent by reference to Giphy's own CDN, not re-uploaded
        // through our /uploads pipeline — same as any other image message
        // from here on (renders, saves, reacts the same way).
        mediaUrl = gifUrl;
        mediaName = 'GIF';
        type = 'image';
      }
      await sendMessage({ containerId: chat.id, body: text, type, mediaUrl, mediaName, mediaMimeType, enrichedMentions, replyToId });
      const fresh = await getMessages(chat.id);
      setMessages(fresh);
      onSent?.();
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setSendError(e.message || 'Message not sent');
    }
  };

  const handleCreatePoll = async ({ question, options, multipleChoice }) => {
    await createPoll(chat.id, { question, options, multipleChoice });
    setCreatingPoll(false);
    onSent?.();
  };

  let lastDay = null;

  return (
    <section className="relative flex min-w-0 flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 py-2.5 dark:border-slate-800 dark:bg-slate-900 md:gap-3 md:px-4">
        <button
          onClick={onBack}
          aria-label="Back to chats"
          className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          onClick={() => {
            if (chat.kind === 'dm' && chat.email) onOpenContact?.({ email: chat.email, containerId: chat.id });
            else if (chat.kind === 'channel') onOpenChannelInfo?.(chat.id);
          }}
          disabled={chat.kind === 'dm' && !chat.email}
          className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
        >
          <Avatar name={chat.title} kind={chat.kind === 'channel' ? 'channel' : undefined} presence={chat.presence} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{chat.title}</p>
            <p className="truncate text-xs text-slate-500">
              {typing.length > 0
                ? `${typing.map((t) => t.userName).join(', ')} typing…`
                : chat.kind === 'dm'
                  ? lastSeenLabel(chat.presence, chat.last_seen_at)
                  : (chat.topic || 'Channel')}
            </p>
          </div>
        </button>
        {chat.kind === 'dm' && (
          <button
            onClick={() => {
              const otherId = chat.id.split('_').find((id) => id !== user?.id);
              if (otherId) onStartHuddle?.(otherId, chat.title, chat.id);
            }}
            title="Start a huddle"
            aria-label="Start a huddle"
            className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </button>
        )}
        {chat.kind === 'channel' && (
          <button
            onClick={() => onOpenLists?.(chat.id)}
            title="Lists"
            aria-label="Lists"
            className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" />
            </svg>
          </button>
        )}
        {chat.kind === 'channel' && (
          <button
            onClick={() => onOpenCanvas?.(chat.id)}
            title="Canvas"
            aria-label="Canvas"
            className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 4h12l4 4v12H4z" /><path d="M16 4v4h4" /><path d="M8 12h8M8 16h5" />
            </svg>
          </button>
        )}
        {chat.kind === 'channel' && (
          <button
            onClick={() => onOpenWorkflows?.(chat.id)}
            title="Workflows"
            aria-label="Workflows"
            className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
          </button>
        )}
        <button
          onClick={() => setWallpaperPickerOpen((v) => !v)}
          title="Chat wallpaper"
          aria-label="Chat wallpaper"
          className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><circle cx="8" cy="10" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" /><circle cx="13" cy="15" r="1.2" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </header>

      {wallpaperPickerOpen && (
        <div className="absolute right-4 top-14 z-20 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-2 px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Chat wallpaper</p>
          <div className="grid grid-cols-3 gap-2">
            {WALLPAPERS.map((w) => (
              <button
                key={w.key ?? 'default'}
                onClick={() => pickWallpaper(w.key)}
                title={w.label}
                className="flex flex-col items-center gap-1 rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span
                  className={`h-8 w-8 rounded-full border ${wallpaper === w.key ? 'ring-2 ring-blue-500' : 'border-slate-300 dark:border-slate-600'}`}
                  style={{ backgroundColor: wallpaperColor(w.key, isDark) || (isDark ? '#0f172a' : '#f1f5f9') }}
                />
                <span className="text-[10px] text-slate-500 dark:text-slate-400">{w.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {pinned && (
        <button
          onClick={() => jumpToMessage(pinned.id)}
          className="flex w-full items-center gap-2 border-b border-slate-200 bg-amber-50 px-4 py-2 text-left text-xs text-slate-600 hover:bg-amber-100 dark:border-slate-800 dark:bg-amber-950/30 dark:text-slate-300 dark:hover:bg-amber-950/50"
        >
          <span className="shrink-0">📌</span>
          <span className="truncate">
            <span className="font-semibold">Pinned:</span> {pinned.text || (pinned.type === 'poll' ? pinned.poll?.question : 'Attachment')}
          </span>
        </button>
      )}

      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
        style={wallpaperColor(wallpaper, isDark) ? { backgroundColor: wallpaperColor(wallpaper, isDark) } : undefined}
      >
        {loading && <p className="py-8 text-center text-sm text-slate-400">Loading messages…</p>}
        {!loading && messages.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">No messages yet. Say hello.</p>
        )}
        {messages.map((m) => {
          const day = dayLabel(m.sent_at);
          const divider = day !== lastDay ? (lastDay = day) : null;
          return (
            <React.Fragment key={m.id}>
              {divider && (
                // Sticky, not just inline: stays pinned at the top of the
                // scroll area while its day's messages scroll past, then
                // the next divider pushes it off — the same "today's date
                // follows you" behavior WhatsApp/Telegram use, rather than
                // the label just scrolling by like any other message.
                <div className="sticky top-0 z-[5] my-4 flex justify-center bg-slate-50/95 py-1 backdrop-blur-sm dark:bg-slate-950/95">
                  <span className="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {divider}
                  </span>
                </div>
              )}
              <div id={`msg-${m.id}`} className={highlightId === m.id ? 'rounded-2xl ring-2 ring-blue-400 transition-shadow' : ''}>
                <MessageBubble
                  message={m}
                  own={m.sender_id === user?.id}
                  showSender={chat.kind === 'channel'}
                  isGroup={chat.kind === 'channel'}
                  canModerate={canModerate}
                  isSuperAdmin={user?.role === 'admin'}
                  onChanged={refreshMessages}
                  onReply={setReplyTo}
                  onForward={setForwarding}
                  onJumpToMessage={jumpToMessage}
                  onOpenProfile={onOpenProfile}
                  currentUserId={user?.id}
                  onOpenDm={onOpenDm}
                />
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {sendError && (
        <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {sendError}
        </p>
      )}

      {ephemeralNotice && (
        <div className="flex items-start gap-2 border-t border-violet-200 bg-violet-50 px-4 py-2 text-xs text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300">
          <span className="mt-0.5 shrink-0 rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-600 dark:bg-violet-900/60 dark:text-violet-300">
            Only visible to you
          </span>
          <p className="min-w-0 flex-1">
            <span className="font-medium">{ephemeralNotice.app_name}: </span>
            {ephemeralNotice.text}
          </p>
          <button onClick={() => setEphemeralNotice(null)} aria-label="Dismiss" className="shrink-0 text-violet-400 hover:text-violet-600">✕</button>
        </div>
      )}

      {scheduled.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setScheduledOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
          >
            <span>🕐</span>
            <span className="flex-1">{scheduled.length} message{scheduled.length === 1 ? '' : 's'} scheduled</span>
            <span>{scheduledOpen ? '▾' : '▸'}</span>
          </button>
          {scheduledOpen && (
            <div className="max-h-32 overflow-y-auto border-t border-slate-100 dark:border-slate-800">
              {scheduled.map((s) => (
                <div key={s.id} className="flex items-center gap-2 px-4 py-1.5 text-xs">
                  <span className="shrink-0 text-slate-400">{new Date(s.send_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{s.body || 'Attachment'}</span>
                  <button onClick={() => cancelScheduled(s.id)} className="shrink-0 font-medium text-red-600 hover:underline">Cancel</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Composer
        chatId={chat.id}
        isChannel={chat.kind === 'channel'}
        onSend={handleSend}
        onSchedule={handleSchedule}
        onTyping={() => sendTyping(chat.id, user?.name)}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onCreatePoll={chat.kind === 'channel' ? () => setCreatingPoll(true) : undefined}
      />

      {creatingPoll && (
        <PollComposerModal onCreate={handleCreatePoll} onClose={() => setCreatingPoll(false)} />
      )}

      {forwarding && (
        <ForwardModal
          message={forwarding}
          onClose={() => setForwarding(null)}
          onForwarded={() => setForwarding(null)}
        />
      )}
    </section>
  );
}
