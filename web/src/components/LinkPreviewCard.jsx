import React, { useEffect, useState } from 'react';
import { getLinkPreview } from '../api/links';

const URL_RE = /(https?:\/\/[^\s<]+)/;

/** Unfurls the first link in a message body into a preview card, the same
 *  way Slack/iMessage do. Fetches lazily (only messages that actually
 *  contain a link pay for it) and fails silently — a broken/unreachable
 *  link just shows nothing extra, never an error in the chat. */
export default function LinkPreviewCard({ text }) {
  const url = text?.match(URL_RE)?.[1];
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    getLinkPreview(url).then((data) => { if (!cancelled && data?.title) setPreview(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [url]);

  if (!preview) return null;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => e.stopPropagation()}
      className="mt-1.5 flex max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-white text-left transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750"
    >
      {preview.image && (
        <img src={preview.image} alt="" className="h-20 w-20 shrink-0 object-cover" loading="lazy" />
      )}
      <div className="min-w-0 flex-1 px-2.5 py-1.5">
        <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-400">{preview.site_name}</p>
        <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{preview.title}</p>
        {preview.description && (
          <p className="line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">{preview.description}</p>
        )}
      </div>
    </a>
  );
}
