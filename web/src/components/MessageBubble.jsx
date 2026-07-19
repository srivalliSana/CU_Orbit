import React from 'react';
import { clockLabel } from '../lib/format';

/** Read receipt: one tick sent, two delivered, two blue read. */
function Ticks({ status }) {
  if (status === 'read') return <span className="text-sky-300" aria-label="Read">✓✓</span>;
  if (status === 'delivered') return <span className="opacity-70" aria-label="Delivered">✓✓</span>;
  return <span className="opacity-70" aria-label="Sent">✓</span>;
}

export default function MessageBubble({ message, own, showSender }) {
  const m = message;

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

  return (
    <div className={`mb-1.5 flex ${own ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 shadow-sm ${
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
            className="mb-1 max-h-80 w-full rounded-lg object-cover"
          />
        )}

        {media && m.type === 'voice' && (
          <audio controls src={media.url} className="mb-1 w-56 max-w-full" />
        )}

        {media && m.type === 'file' && (
          <a
            href={media.url}
            target="_blank"
            rel="noreferrer"
            className="mb-1 flex items-center gap-2 underline underline-offset-2"
          >
            📎 <span className="truncate">{media.url.split('/').pop()}</span>
          </a>
        )}

        {m.text ? <p className="whitespace-pre-wrap break-words text-sm">{m.text}</p> : null}

        <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${own ? 'text-blue-100' : 'text-slate-400'}`}>
          {m.edited_at ? <span className="italic">edited</span> : null}
          <span>{clockLabel(m.sent_at)}</span>
          {own ? <Ticks status={m.status} /> : null}
        </div>
      </div>
    </div>
  );
}
