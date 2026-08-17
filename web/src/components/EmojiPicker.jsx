import React, { useState } from 'react';

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

export default function EmojiPicker({ onPick, onClose }) {
  const [custom, setCustom] = useState('');

  const submitCustom = (e) => {
    e.preventDefault();
    const emoji = custom.trim();
    if (!emoji) return;
    onPick(emoji);
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
        <form onSubmit={submitCustom} className="mt-3 flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <input
            autoFocus
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
