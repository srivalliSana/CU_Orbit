import React, { useEffect, useMemo, useState } from 'react';
import Avatar from './Avatar';
import { createGroup, listUsers } from '../api/chat';

export default function NewGroupModal({ user, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [people, setPeople] = useState([]);
  const [picked, setPicked] = useState(() => new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    listUsers()
      .then((list) => setPeople(list.filter((p) => p.id !== user?.id)))
      .catch(() => setPeople([]));
  }, [user?.id]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? people.filter((p) => (p.name || '').toLowerCase().includes(t)) : people;
  }, [people, q]);

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const submit = async (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      const channel = await createGroup({
        name: clean,
        description: topic.trim(),
        type: isPrivate ? 'private' : 'public',
        members: [...picked],
      });
      onCreated(channel);
    } catch (err) {
      setError(err.message || 'Could not create the group.');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="New group"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">New group</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <label className="block text-xs font-medium text-slate-500">Group name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="e.g. BCA 2024 Project Team"
            className="mt-1 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm outline-none ring-blue-500/40 focus:ring-2 dark:bg-slate-800 dark:text-slate-100"
          />

          <label className="mt-4 block text-xs font-medium text-slate-500">Description (optional)</label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={140}
            placeholder="What is this group for?"
            className="mt-1 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm outline-none ring-blue-500/40 focus:ring-2 dark:bg-slate-800 dark:text-slate-100"
          />

          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="h-4 w-4" />
            Private — only invited members can find and join
          </label>

          <div className="mt-5 flex items-baseline justify-between">
            <span className="text-xs font-medium text-slate-500">Add people</span>
            <span className="text-xs text-slate-400">{picked.size} selected</span>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people"
            className="mt-1 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm outline-none ring-blue-500/40 focus:ring-2 dark:bg-slate-800 dark:text-slate-100"
          />

          <ul className="mt-2 max-h-52 overflow-y-auto">
            {shown.length === 0 && <li className="py-4 text-center text-xs text-slate-400">No people found.</li>}
            {shown.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4" />
                  <Avatar name={p.name} url={p.avatarUrl} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{p.name}</span>
                </label>
              </li>
            ))}
          </ul>

          {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Create group'}
          </button>
        </footer>
      </form>
    </div>
  );
}
