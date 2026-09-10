import React, { useEffect, useState } from 'react';
import { addMessageToList, createList, getLists } from '../api/lists';

/** "Convert to list item" — pick an existing list in this channel, or
 *  create one on the spot, and the message's text becomes the item's
 *  title field. Opened from a message's action menu. */
export default function AddToListModal({ channelId, message, onClose, onAdded }) {
  const [lists, setLists] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { getLists(channelId).then(setLists).catch(() => setLists([])); }, [channelId]);

  const addTo = async (listId) => {
    setBusy(true);
    setError(null);
    try {
      await addMessageToList(listId, message.id);
      onAdded?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Could not add to that list.');
    } finally {
      setBusy(false);
    }
  };

  const createAndAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const list = await createList(channelId, { name: name.trim() });
      await addMessageToList(list.id, message.id);
      onAdded?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Could not create the list.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-900">
        <h3 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Add to list</h3>
        <p className="mb-3 truncate text-xs text-slate-500">{message.text || 'Attachment'}</p>

        {!lists ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : (
          <div className="mb-3 max-h-56 space-y-1 overflow-y-auto">
            {lists.length === 0 && !creating && <p className="text-xs text-slate-400">No lists in this channel yet.</p>}
            {lists.map((l) => (
              <button
                key={l.id} disabled={busy} onClick={() => addTo(l.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
              >
                <span>{l.icon}</span>
                <span className="truncate text-slate-700 dark:text-slate-200">{l.name}</span>
              </button>
            ))}
          </div>
        )}

        {creating ? (
          <form onSubmit={createAndAdd} className="flex items-center gap-2">
            <input
              autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="New list name"
              className="min-w-0 flex-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
            />
            <button type="submit" disabled={busy} className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? '…' : 'Create'}
            </button>
          </form>
        ) : (
          <button onClick={() => setCreating(true)} className="text-xs font-medium text-blue-600 hover:underline">
            + New list
          </button>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
