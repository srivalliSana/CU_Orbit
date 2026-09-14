import React, { useEffect, useState } from 'react';
import { createWorkflow, deleteWorkflow, getWorkflows, updateWorkflow } from '../api/workflows';
import { getLists } from '../api/lists';

const TRIGGER_LABELS = {
  message_contains: 'A message contains a keyword',
  member_joined: 'Someone joins this channel',
  schedule: 'On a schedule',
};
const ACTION_LABELS = {
  post_message: 'Post a message',
  add_list_item: 'Add an item to a list',
};
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function triggerSummary(w) {
  if (w.trigger_type === 'message_contains') return `contains "${w.trigger_config?.keyword || ''}"`;
  if (w.trigger_type === 'member_joined') return 'someone joins';
  if (w.trigger_type === 'schedule') {
    const h = String(w.trigger_config?.hour ?? 0).padStart(2, '0');
    const m = String(w.trigger_config?.minute ?? 0).padStart(2, '0');
    const days = w.trigger_config?.days?.length ? w.trigger_config.days.map((d) => DAY_LABELS[d]).join(',') : 'every day';
    return `${h}:${m} (${days})`;
  }
  return '';
}

/** Genuinely no-code automation — one trigger + one action per workflow,
 *  picked from a form rather than Slack's full drag-and-drop visual
 *  canvas. Same full-screen-panel shape as Lists/Canvas. */
export default function WorkflowsPanel({ channelId, onClose }) {
  const [workflows, setWorkflows] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = () => getWorkflows(channelId).then(setWorkflows).catch((e) => setError(e.message || 'Could not load workflows.'));
  useEffect(() => { load(); }, [channelId]);

  const toggleActive = async (w) => {
    await updateWorkflow(w.id, { is_active: !w.is_active }).catch(() => {});
    load();
  };

  const remove = async (w) => {
    if (!confirm(`Delete "${w.name}"?`)) return;
    await deleteWorkflow(w.id).catch(() => {});
    load();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">⚡ Workflows</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setCreating(true)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            + New workflow
          </button>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-6">
        <p className="mb-4 text-xs text-slate-500">
          Automate this channel: when something happens, do something — no code required.
        </p>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {!workflows && !error && <p className="text-sm text-slate-400">Loading…</p>}
        {workflows?.length === 0 && <p className="text-sm text-slate-400">No workflows yet in this channel.</p>}

        <div className="space-y-2">
          {workflows?.map((w) => (
            <div key={w.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{w.name}</p>
                <p className="truncate text-xs text-slate-500">
                  When {TRIGGER_LABELS[w.trigger_type]?.toLowerCase()} ({triggerSummary(w)}) → {ACTION_LABELS[w.action_type]?.toLowerCase()}
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                <input type="checkbox" checked={w.is_active} onChange={() => toggleActive(w)} />
                Active
              </label>
              <button onClick={() => remove(w)} className="shrink-0 text-xs font-medium text-red-600 hover:underline">Delete</button>
            </div>
          ))}
        </div>
      </div>

      {creating && (
        <WorkflowForm
          channelId={channelId}
          onCreated={() => { setCreating(false); load(); }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function WorkflowForm({ channelId, onCreated, onClose }) {
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('message_contains');
  const [keyword, setKeyword] = useState('');
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [actionType, setActionType] = useState('post_message');
  const [actionBody, setActionBody] = useState('');
  const [listId, setListId] = useState('');
  const [lists, setLists] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { getLists(channelId).then(setLists).catch(() => setLists([])); }, [channelId]);

  const toggleDay = (d) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const trigger_config =
        triggerType === 'message_contains' ? { keyword: keyword.trim() }
        : triggerType === 'schedule' ? { hour: Number(hour), minute: Number(minute), days }
        : {};
      const action_config =
        actionType === 'post_message' ? { body: actionBody }
        : { list_id: listId, body: actionBody };
      if (triggerType === 'message_contains' && !keyword.trim()) throw new Error('Enter a keyword to watch for.');
      if (actionType === 'add_list_item' && !listId) throw new Error('Pick a list.');
      if (!actionBody.trim()) throw new Error('Enter what the action should do.');
      await createWorkflow(channelId, { name: name.trim(), trigger_type: triggerType, trigger_config, action_type: actionType, action_config });
      onCreated();
    } catch (e) {
      setError(e.message || 'Could not create the workflow.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">New workflow</h3>

        <label className="text-[11px] font-medium text-slate-500">Name</label>
        <input
          autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Welcome new members"
          className="mt-0.5 mb-3 w-full rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
        />

        <label className="text-[11px] font-medium text-slate-500">When…</label>
        <select
          value={triggerType} onChange={(e) => setTriggerType(e.target.value)}
          className="mt-0.5 mb-2 w-full rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
        >
          {Object.entries(TRIGGER_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        {triggerType === 'message_contains' && (
          <input
            value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="keyword, e.g. help"
            className="mb-3 w-full rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
          />
        )}
        {triggerType === 'schedule' && (
          <div className="mb-3 space-y-2">
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="23" value={hour} onChange={(e) => setHour(e.target.value)} className="w-16 rounded-lg bg-slate-100 px-2 py-1.5 text-xs text-slate-700 outline-none dark:bg-slate-800 dark:text-slate-200" />
              <span className="text-xs text-slate-400">:</span>
              <input type="number" min="0" max="59" value={minute} onChange={(e) => setMinute(e.target.value)} className="w-16 rounded-lg bg-slate-100 px-2 py-1.5 text-xs text-slate-700 outline-none dark:bg-slate-800 dark:text-slate-200" />
              <span className="text-[11px] text-slate-400">server time</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {DAY_LABELS.map((label, i) => (
                <button
                  type="button" key={label} onClick={() => toggleDay(i)}
                  className={`rounded-full px-2 py-1 text-[11px] font-medium ${days.includes(i) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="text-[11px] font-medium text-slate-500">Then…</label>
        <select
          value={actionType} onChange={(e) => setActionType(e.target.value)}
          className="mt-0.5 mb-2 w-full rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
        >
          {Object.entries(ACTION_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        {actionType === 'add_list_item' && (
          <select
            value={listId} onChange={(e) => setListId(e.target.value)}
            className="mb-2 w-full rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 outline-none dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">Choose a list…</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.icon} {l.name}</option>)}
          </select>
        )}
        <textarea
          value={actionBody} onChange={(e) => setActionBody(e.target.value)} rows={3}
          placeholder={actionType === 'post_message' ? 'Message text — use {{user}} for the triggering person\'s name' : 'Item title — use {{user}} for the triggering person\'s name'}
          className="mb-3 w-full rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
        />

        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create workflow'}
          </button>
        </div>
      </form>
    </div>
  );
}
