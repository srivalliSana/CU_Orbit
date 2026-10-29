import React, { useEffect, useState } from 'react';
import { getSharedMedia } from '../api/chat';
import { saveFile } from '../lib/saveFile';

const TABS = [
  { key: 'media', label: 'Media' },
  { key: 'files', label: 'Files' },
  { key: 'links', label: 'Links' },
];

function fileLabel(name) {
  const ext = (name || '').split('.').pop();
  return ext && ext.length <= 5 ? ext.toUpperCase() : 'FILE';
}

/**
 * A conversation's shared content, Discord-style: a Media grid (images +
 * videos, tap to view fullscreen), a Files list, and a Links list. Shared
 * between ChannelInfoPanel and ContactPanel, which were carrying identical
 * copies of this before — one list, one category tab row, no zoom and no
 * grid — rebuilt here instead of duplicated again.
 */
export default function SharedMediaPanel({ containerId, onJumpToMessage }) {
  const [tab, setTab] = useState('media');
  const [items, setItems] = useState(null);
  const [viewer, setViewer] = useState(null); // { url, kind, messageId }

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    const load = async () => {
      if (tab === 'media') {
        const [images, videos] = await Promise.all([
          getSharedMedia(containerId, 'image'),
          getSharedMedia(containerId, 'video'),
        ]);
        return [...images, ...videos].sort((a, b) => b.sent_at - a.sent_at);
      }
      if (tab === 'files') return getSharedMedia(containerId, 'document');
      return getSharedMedia(containerId, 'link');
    };
    load()
      .then((rows) => { if (!cancelled) setItems(rows); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [tab, containerId]);

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium ${
              tab === t.key ? 'bg-white text-accent-600 shadow dark:bg-slate-700' : 'text-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {items === null && <p className="text-sm text-slate-400">Loading…</p>}
      {items && items.length === 0 && <p className="text-sm text-slate-400">Nothing here yet.</p>}

      {tab === 'media' && items && items.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {items.map((it) => {
            const att = it.attachments?.[0];
            if (!att) return null;
            const isVideo = it.type === 'video';
            return (
              <button
                key={it.id}
                onClick={() => setViewer({ url: att.url, name: att.name, kind: isVideo ? 'video' : 'image', messageId: it.id })}
                className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800"
              >
                {isVideo ? (
                  <video src={att.url} className="h-full w-full object-cover" muted preload="metadata" />
                ) : (
                  <img src={att.url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                )}
                {isVideo && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/10">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {tab === 'files' && items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => {
            const att = it.attachments?.[0];
            if (!att) return null;
            return (
              <li
                key={it.id}
                onClick={() => onJumpToMessage?.(it.id)}
                className="flex cursor-pointer items-center gap-3 rounded-lg bg-slate-50 p-2.5 text-sm hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-[9px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                  {fileLabel(att.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-700 dark:text-slate-200">{att.name || 'Attachment'}</p>
                  <p className="text-xs text-slate-400">{it.sender_name}</p>
                </div>
                <span className="flex shrink-0 gap-2 text-xs">
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-accent-600 underline underline-offset-2 dark:text-accent-400"
                  >
                    Open
                  </a>
                  <button
                    onClick={(e) => { e.stopPropagation(); saveFile(att.url, att.name); }}
                    className="text-accent-600 underline underline-offset-2 dark:text-accent-400"
                  >
                    Save
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {tab === 'links' && items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              onClick={() => onJumpToMessage?.(it.id)}
              className="cursor-pointer rounded-lg bg-slate-50 p-2.5 text-sm hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <p className="text-xs font-semibold text-slate-500">{it.sender_name}</p>
              {(it.links || []).map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="block truncate text-accent-600 underline underline-offset-2 dark:text-accent-400"
                >
                  {url}
                </a>
              ))}
            </li>
          ))}
        </ul>
      )}

      {viewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setViewer(null)}>
          {viewer.kind === 'video' ? (
            <video src={viewer.url} controls autoPlay className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()} />
          ) : (
            <img src={viewer.url} alt="" className="max-h-full max-w-full object-contain" />
          )}

          <button
            onClick={(e) => { e.stopPropagation(); onJumpToMessage?.(viewer.messageId); setViewer(null); }}
            aria-label="Jump to message"
            title="Jump to message"
            className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); saveFile(viewer.url, viewer.name || `media-${Date.now()}`); }}
            aria-label="Save"
            title="Save"
            className="absolute right-16 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button
            onClick={() => setViewer(null)}
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
