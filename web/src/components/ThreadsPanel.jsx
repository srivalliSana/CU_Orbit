import React, { useEffect, useState } from 'react';
import { getThread, getThreads, markThreadRead } from '../api/threads';
import { sendMessage } from '../api/chat';
import { timeLabel } from '../lib/format';
import MessageBubble from './MessageBubble';
import Composer from './Composer';

/** Every thread the signed-in user is part of — they sent the root message,
 *  or they replied to someone else's. Mirrors mobile's ThreadsScreen +
 *  ThreadDetailScreen, built as one full-screen panel with two states so
 *  it can reuse the same MessageBubble/Composer the main chat window does. */
export default function ThreadsPanel({ user, onClose, onOpenDm, onOpenProfile }) {
  const [parentId, setParentId] = useState(null);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900">
      {parentId ? (
        <ThreadDetail
          parentId={parentId}
          user={user}
          onBack={() => setParentId(null)}
          onClose={onClose}
          onOpenDm={onOpenDm}
          onOpenProfile={onOpenProfile}
        />
      ) : (
        <ThreadsHome onOpenThread={setParentId} onClose={onClose} />
      )}
    </div>
  );
}

function ThreadsHome({ onOpenThread, onClose }) {
  const [threads, setThreads] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getThreads().then(setThreads).catch((e) => setError(e.message || 'Could not load threads.'));
  }, []);

  return (
    <>
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">🧵 Threads</h2>
        <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto">
        {error && <p role="alert" className="p-4 text-sm text-red-600">{error}</p>}
        {!threads && !error && <p className="p-4 text-sm text-slate-400">Loading…</p>}
        {threads && threads.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-500">No threads yet.</p>
            <p className="mt-1 text-xs text-slate-400">Reply to a message from inside a chat to start one.</p>
          </div>
        )}
        {threads?.map((t) => {
          const preview = t.last_reply ?? { sender_name: t.root_sender_name, text: t.root_text, sent_at: t.root_sent_at };
          return (
            <button
              key={t.parent_message_id}
              onClick={() => onOpenThread(t.parent_message_id)}
              className="flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-5 py-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {t.is_dm ? 'Direct message' : `# ${t.channel_name || 'channel'}`}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">{timeLabel(preview.sent_at)}</span>
              </div>
              <p className="w-full truncate text-xs text-slate-400">{t.root_text || 'Attachment'}</p>
              <div className="flex w-full items-center gap-1.5">
                <p className="line-clamp-1 flex-1 text-sm text-slate-700 dark:text-slate-200">
                  <b>{preview.sender_name}:</b> {preview.text || 'Attachment'}
                </p>
                {t.has_unread && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
              </div>
              <span className="text-[11px] text-slate-400">{t.reply_count} {t.reply_count === 1 ? 'reply' : 'replies'}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function ThreadDetail({ parentId, user, onBack, onClose, onOpenDm, onOpenProfile }) {
  const [data, setData] = useState(null);   // { root, replies }
  const [error, setError] = useState(null);

  const load = () => getThread(parentId).then(setData).catch((e) => setError(e.message || 'Could not load thread.'));
  useEffect(() => {
    load();
    markThreadRead(parentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId]);

  const handleSend = async ({ text, enrichedMentions }) => {
    if (!data) return;
    await sendMessage({
      containerId: data.root.channel_id || data.root.dm_id,
      body: text, type: 'text', enrichedMentions, replyToId: parentId,
    });
    load();
  };

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={onBack} className="text-xs text-blue-600 underline">Back to threads</button>
      </div>
    );
  }
  if (!data) return <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading…</div>;

  const { root, replies } = data;
  const isChannel = !!root.channel_id;

  return (
    <>
      <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
        <button onClick={onBack} aria-label="Back to threads" className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Thread</span>
        <button onClick={onClose} aria-label="Close" className="ml-auto shrink-0 text-slate-400 hover:text-slate-600">✕</button>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4">
          <MessageBubble message={root} own={root.sender_id === user?.id} showSender isGroup={isChannel} currentUserId={user?.id} onChanged={load} onOpenProfile={onOpenProfile} onOpenDm={onOpenDm} />
          <div className="my-2 flex items-center gap-2 text-[11px] font-medium text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>
          {replies.map((m) => (
            <MessageBubble key={m.id} message={m} own={m.sender_id === user?.id} showSender isGroup={isChannel} currentUserId={user?.id} onChanged={load} onOpenProfile={onOpenProfile} onOpenDm={onOpenDm} />
          ))}
        </div>

        <Composer
          chatId={root.channel_id || root.dm_id}
          isChannel={isChannel}
          onSend={handleSend}
          onTyping={() => {}}
          replyTo={null}
          onCancelReply={() => {}}
        />
      </div>
    </>
  );
}
