import React, { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import MessageBubble from './MessageBubble';
import Composer from './Composer';
import { getMessages, getTyping, markConversationRead, sendMessage, uploadFile } from '../api/chat';
import { dayLabel, lastSeenLabel } from '../lib/format';

const POLL_MS = 3000;

export default function ChatWindow({ chat, user, onSent, onOpenContact }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState([]);
  const [sendError, setSendError] = useState(null);
  const scroller = useRef(null);
  const atBottom = useRef(true);

  // Poll this conversation. Replaced by sockets in the realtime phase.
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

  // Marking read is deliberately tied to the messages we have actually shown,
  // not merely to opening the chat, so a receipt means it was on screen.
  useEffect(() => {
    if (!messages.length) return;
    if (document.visibilityState !== 'visible') return;
    const incoming = messages.some((m) => m.sender_id !== user?.id && m.status !== 'read');
    if (!incoming) return;
    markConversationRead(chat.id).then(() => onSent?.());
  }, [messages, chat.id, user?.id]);

  useEffect(() => {
    if (chat.kind !== 'channel') return;
    const t = setInterval(async () => {
      const list = await getTyping(chat.id);
      setTyping((list || []).filter((x) => x.userId !== user?.id));
    }, POLL_MS);
    return () => clearInterval(t);
  }, [chat.id, chat.kind, user?.id]);

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

  const handleSend = async ({ text, file }) => {
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
      let mediaUrl, type = 'text';
      if (file) {
        const up = await uploadFile(file);
        mediaUrl = up.url;
        type = file.type.startsWith('image/') ? 'image' : 'file';
      }
      await sendMessage({ containerId: chat.id, body: text, type, mediaUrl });
      const fresh = await getMessages(chat.id);
      setMessages(fresh);
      onSent?.();
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setSendError(e.message || 'Message not sent');
    }
  };

  let lastDay = null;

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={() => chat.kind === 'dm' && chat.email && onOpenContact?.({ email: chat.email })}
          disabled={chat.kind !== 'dm' || !chat.email}
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
      </header>

      <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-4">
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
                <div className="my-4 flex justify-center">
                  <span className="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {divider}
                  </span>
                </div>
              )}
              <MessageBubble
                message={m}
                own={m.sender_id === user?.id}
                showSender={chat.kind === 'channel'}
                isGroup={chat.kind === 'channel'}
              />
            </React.Fragment>
          );
        })}
      </div>

      {sendError && (
        <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {sendError}
        </p>
      )}

      <Composer chatId={chat.id} isChannel={chat.kind === 'channel'} onSend={handleSend} />
    </section>
  );
}
