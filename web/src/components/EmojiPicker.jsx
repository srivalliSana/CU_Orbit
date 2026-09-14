import React, { useEffect, useRef, useState } from 'react';
import { getCustomEmojis, uploadCustomEmoji } from '../api/customEmojis';

// A broad, curated grid rather than a full Unicode emoji library (no new
// dependency) — plus a text input below it that accepts anything typed via
// the OS emoji keyboard, so "react with any emoji" isn't actually capped to
// this list.
const EMOJI_GRID = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😜', '🤔', '😎', '🥳', '😢',
  '😭', '😡', '🤯', '😱', '🥺', '😴', '🤒', '🤗', '🙄', '😇', '🤩', '😏',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '✌️', '👌', '🤞', '👋', '🫡',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💯', '🔥', '✨',
  '🎉', '🎊', '🎂', '🎁', '🏆', '⭐', '🚀', '💡', '📌', '✅', '❌', '⚠️',
  '👀', '🧠', '💀', '👻', '🤖', '🐱', '🐶', '🦄', '🍕', '☕', '🍺', '⚽',
];

/** A :shortcode:-addressed custom emoji renders as its uploaded image
 *  anywhere a reaction/message shows emoji — this is the one shared lookup
 *  every one of those call sites should use rather than each guessing at
 *  the URL shape itself. */
export function useCustomEmojiMap() {
  const [map, setMap] = useState(new Map());
  useEffect(() => {
    getCustomEmojis().then((rows) => setMap(new Map(rows.map((r) => [`:${r.name}:`, r.image_url])))).catch(() => {});
  }, []);
  return map;
}

export default function EmojiPicker({ onPick, onClose }) {
  const [custom, setCustom] = useState('');
  const [teamEmoji, setTeamEmoji] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [error, setError] = useState(null);
  const fileInput = useRef(null);

  const loadTeamEmoji = () => getCustomEmojis().then(setTeamEmoji).catch(() => setTeamEmoji([]));
  useEffect(() => { loadTeamEmoji(); }, []);

  const submitCustom = (e) => {
    e.preventDefault();
    const emoji = custom.trim();
    if (!emoji) return;
    onPick(emoji);
  };

  const pickFile = () => fileInput.current?.click();

  const onFileChosen = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = (uploadName || file.name.replace(/\.[^.]+$/, '')).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32);
    if (name.length < 2) { setError('Give it a name first (2+ letters).'); return; }
    setUploading(true);
    setError(null);
    try {
      await uploadCustomEmoji(name, file);
      setUploadName('');
      await loadTeamEmoji();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-900"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">React with</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="grid grid-cols-6 gap-1">
          {EMOJI_GRID.map((e) => (
            <button
              key={e}
              onClick={() => onPick(e)}
              className="rounded-lg py-1.5 text-xl hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {e}
            </button>
          ))}
        </div>

        <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Team emoji</p>
          {teamEmoji === null ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : teamEmoji.length === 0 ? (
            <p className="text-xs text-slate-400">None yet — upload the first one below.</p>
          ) : (
            <div className="grid grid-cols-6 gap-1">
              {teamEmoji.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onPick(`:${e.name}:`)}
                  title={`:${e.name}:`}
                  className="flex items-center justify-center rounded-lg py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <img src={e.image_url} alt={e.name} className="h-6 w-6 object-contain" />
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-1.5">
            <input
              value={uploadName}
              onChange={(ev) => setUploadName(ev.target.value)}
              placeholder="name"
              className="w-20 min-w-0 rounded-lg bg-slate-100 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
            />
            <button
              type="button" onClick={pickFile} disabled={uploading}
              className="flex-1 rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
            >
              {uploading ? 'Uploading…' : '+ Upload image'}
            </button>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={onFileChosen} className="hidden" />
          </div>
          {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
        </div>

        <form onSubmit={submitCustom} className="mt-3 flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Or type/paste any emoji"
            className="min-w-0 flex-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
          />
          <button
            type="submit"
            disabled={!custom.trim()}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            React
          </button>
        </form>
      </div>
    </div>
  );
}
