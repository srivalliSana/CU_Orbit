import React, { useEffect, useState } from 'react';
import { createCanvas, deleteCanvas, getCanvas, updateCanvas } from '../api/canvas';
import { renderMessageText } from '../lib/markdown';

/** One pinned doc per channel — Slack's "channel canvas." Plain text with
 *  the same lightweight markdown chat messages already render; last-write-
 *  wins on save, no realtime collaborative editing. */
export default function CanvasPanel({ channelId, onClose }) {
  const [canvas, setCanvas] = useState(undefined);   // undefined = loading, null = doesn't exist yet
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [bodyDraft, setBodyDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => getCanvas(channelId).then(setCanvas).catch((e) => setError(e.message || 'Could not load the canvas.'));
  useEffect(() => { load(); }, [channelId]);

  const startCreate = async () => {
    setSaving(true);
    try {
      const created = await createCanvas(channelId, { title: 'Untitled canvas', body: '' });
      setCanvas(created);
      setTitleDraft(created.title);
      setBodyDraft(created.body);
      setEditing(true);
    } catch (e) {
      setError(e.message || 'Could not create the canvas.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    setTitleDraft(canvas.title);
    setBodyDraft(canvas.body);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateCanvas(canvas.id, { title: titleDraft, body: bodyDraft });
      setCanvas(updated);
      setEditing(false);
    } catch (e) {
      setError(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm('Delete this canvas? This removes it for everyone in the channel.')) return;
    await deleteCanvas(canvas.id).catch(() => {});
    setCanvas(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">📝 Canvas</h2>
        <div className="flex items-center gap-2">
          {canvas && !editing && (
            <>
              <button onClick={startEdit} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
                Edit
              </button>
              <button onClick={remove} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
                Delete
              </button>
            </>
          )}
          {editing && (
            <>
              <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                Cancel
              </button>
              <button onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {canvas === undefined && !error && <p className="text-sm text-slate-400">Loading…</p>}

        {canvas === null && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <p className="text-sm text-slate-500">No canvas yet for this channel.</p>
            <p className="max-w-sm text-xs text-slate-400">
              A canvas is a shared doc pinned to the channel — meeting notes, a project brief, onboarding info, anything worth keeping visible and editable by the whole channel.
            </p>
            <button onClick={startCreate} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create canvas'}
            </button>
          </div>
        )}

        {canvas && !editing && (
          <div>
            <h1 className="mb-4 text-xl font-bold text-slate-800 dark:text-slate-100">{canvas.title}</h1>
            {canvas.body ? (
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                {renderMessageText(canvas.body, {
                  linkClassName: 'underline underline-offset-2 text-blue-600 dark:text-blue-400',
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400">This canvas is empty. Click Edit to start writing.</p>
            )}
            <p className="mt-6 text-[11px] text-slate-400">Last edited {new Date(canvas.updatedAt).toLocaleString()}</p>
          </div>
        )}

        {canvas && editing && (
          <div className="flex h-full flex-col gap-3">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="Title"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <textarea
              value={bodyDraft}
              onChange={(e) => setBodyDraft(e.target.value)}
              placeholder="Write anything — **bold**, _italic_, links, @mentions all render the same as in chat."
              rows={20}
              className="w-full flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>
        )}
      </div>
    </div>
  );
}
