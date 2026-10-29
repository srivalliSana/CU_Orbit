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
function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

async function copyToClipboard(url) {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

export default function SharedMediaPanel({ containerId, onJumpToMessage }) {
  const [tab, setTab] = useState('media');
  const [items, setItems] = useState(null);
  const [viewer, setViewer] = useState(null); // { url, name, kind, messageId, senderName, sentAt }
  const [details, setDetails] = useState(null); // { name, kind, senderName, sentAt, url }
  const [copiedKey, setCopiedKey] = useState(null);

  const copyLink = async (url, key) => {
    if (await copyToClipboard(url)) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    }
  };

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
                onClick={() => setViewer({
                  url: att.url, name: att.name, kind: isVideo ? 'video' : 'image',
                  messageId: it.id, senderName: it.sender_name, sentAt: it.sent_at,
                })}
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
                <span className="flex shrink-0 flex-wrap justify-end gap-x-2 gap-y-1 text-xs">
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
                    Download
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); copyLink(att.url, it.id); }}
                    className="text-accent-600 underline underline-offset-2 dark:text-accent-400"
                  >
                    {copiedKey === it.id ? 'Copied!' : 'Copy link'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetails({ name: att.name, kind: it.type, senderName: it.sender_name, sentAt: it.sent_at, url: att.url });
                    }}
                    className="text-accent-600 underline underline-offset-2 dark:text-accent-400"
                  >
                    Details
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
            onClick={(e) => { e.stopPropagation(); copyLink(viewer.url, 'viewer'); }}
            aria-label="Copy link"
            title={copiedKey === 'viewer' ? 'Copied!' : 'Copy link'}
            className="absolute right-28 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
          >
            {copiedKey === 'viewer' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDetails({ name: viewer.name, kind: viewer.kind, senderName: viewer.senderName, sentAt: viewer.sentAt, url: viewer.url });
            }}
            aria-label="View details"
            title="View details"
            className="absolute right-40 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
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

      {details && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setDetails(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-slate-800"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">File details</h3>
              <button onClick={() => setDetails(null)} aria-label="Close" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Name</dt>
                <dd className="truncate text-right text-slate-700 dark:text-slate-200">{details.name || 'Attachment'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Type</dt>
                <dd className="text-slate-700 dark:text-slate-200">{details.kind}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Shared by</dt>
                <dd className="text-slate-700 dark:text-slate-200">{details.senderName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Date</dt>
                <dd className="text-slate-700 dark:text-slate-200">{formatDate(details.sentAt)}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
