import React, { useEffect, useRef, useState } from 'react';
import {
  createField, createItem, createList, deleteField, deleteItem, deleteList,
  exportListCsv, getList, getLists, importListCsv, updateField, updateItem, updateList,
} from '../api/lists';
import { parseCsv } from '../lib/csv';

const FIELD_TYPES = [
  { id: 'text', label: 'Text' },
  { id: 'long_text', label: 'Long text' },
  { id: 'select', label: 'Dropdown' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'date', label: 'Date' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'checkbox', label: 'Checkbox' },
  { id: 'number', label: 'Number' },
];

const TYPE_ICON = {
  text: '✎', long_text: '≡', select: '▾', status: '◔', priority: '!',
  date: '📅', assignee: '👤', checkbox: '☑', number: '#',
};

const OPTION_TYPES = ['select', 'status', 'priority'];

/** Full-screen Lists workspace for one channel — list-of-lists, then a
 *  spreadsheet-style table for whichever list is open. Everything here is
 *  Phase 1: custom fields + table view + CSV import/export. No kanban,
 *  subtasks, per-item threads, templates, or workflow automation yet. */
export default function ListsPanel({ channelId, onClose }) {
  const [selectedListId, setSelectedListId] = useState(null);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900">
      {selectedListId ? (
        <ListDetail listId={selectedListId} onBack={() => setSelectedListId(null)} onClose={onClose} />
      ) : (
        <ListsHome channelId={channelId} onOpenList={setSelectedListId} onClose={onClose} />
      )}
    </div>
  );
}

function ListsHome({ channelId, onOpenList, onClose }) {
  const [lists, setLists] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => getLists(channelId).then(setLists).catch(() => setLists([]));
  useEffect(() => { load(); }, [channelId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const list = await createList(channelId, { name: name.trim() });
      setName('');
      setCreating(false);
      await load();
      onOpenList(list.id);
    } catch (e) {
      setError(e.message || 'Could not create the list.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">📋 Lists</h2>
        <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">Task and project lists shared with this channel.</p>
          <button
            onClick={() => setCreating((s) => !s)}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            {creating ? 'Cancel' : '+ New list'}
          </button>
        </div>

        {creating && (
          <form onSubmit={submit} className="mb-5 flex items-center gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <input
              autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="List name, e.g. Bug tracker"
              className="min-w-0 flex-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
            />
            <button type="submit" disabled={busy} className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? 'Creating…' : 'Create'}
            </button>
          </form>
        )}
        {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

        {!lists ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : lists.length === 0 ? (
          <p className="text-sm text-slate-400">No lists yet in this channel.</p>
        ) : (
          <div className="space-y-2">
            {lists.map((l) => (
              <button
                key={l.id}
                onClick={() => onOpenList(l.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
              >
                <span className="text-xl">{l.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{l.name}</p>
                  <p className="text-xs text-slate-500">{l.item_count} item{l.item_count === 1 ? '' : 's'}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ListDetail({ listId, onBack, onClose }) {
  const [data, setData] = useState(null);   // { list, fields, items }
  const [error, setError] = useState(null);
  const [addingField, setAddingField] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [view, setView] = useState('table');   // 'table' | 'board'
  const [groupFieldId, setGroupFieldId] = useState(null);   // which select/status/priority field the board groups by
  const [collapsedParents, setCollapsedParents] = useState(() => new Set());

  const load = () => getList(listId).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [listId]);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={onBack} className="text-xs text-blue-600 underline">Back to lists</button>
      </div>
    );
  }
  if (!data) return <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading…</div>;

  const { list, fields, items } = data;

  const saveName = async () => {
    setRenaming(false);
    if (!nameDraft.trim() || nameDraft.trim() === list.name) return;
    const updated = await updateList(list.id, { name: nameDraft.trim() });
    setData((d) => ({ ...d, list: updated }));
  };

  const removeList = async () => {
    if (!confirm(`Delete "${list.name}"? This removes every item in it.`)) return;
    await deleteList(list.id);
    onBack();
  };

  const addField = async (fieldData) => {
    const field = await createField(list.id, fieldData);
    setData((d) => ({ ...d, fields: [...d.fields, field] }));
    setAddingField(false);
  };

  const addItem = async () => {
    const item = await createItem(list.id, {});
    setData((d) => ({ ...d, items: [...d.items, item] }));
  };

  const addSubtask = async (parentId) => {
    const item = await createItem(list.id, {}, parentId);
    setData((d) => ({ ...d, items: [...d.items, item] }));
    setCollapsedParents((s) => { const next = new Set(s); next.delete(parentId); return next; });
  };

  const toggleCollapsed = (itemId) => {
    setCollapsedParents((s) => {
      const next = new Set(s);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  };

  const titleField = fields.find((f) => f.is_title_field) || fields[0];
  const topLevelItems = items.filter((it) => !it.parent_item_id);
  const childrenByParent = items.reduce((map, it) => {
    if (it.parent_item_id) (map[it.parent_item_id] ||= []).push(it);
    return map;
  }, {});

  return (
    <>
      <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
        <button onClick={onBack} aria-label="Back to lists" className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span className="text-lg">{list.icon}</span>
        {renaming ? (
          <input
            autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName} onKeyDown={(e) => e.key === 'Enter' && saveName()}
            className="min-w-0 flex-1 rounded-lg bg-slate-100 px-2 py-1 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-100"
          />
        ) : (
          <button onClick={() => { setNameDraft(list.name); setRenaming(true); }} className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-800 hover:underline dark:text-slate-100">
            {list.name}
          </button>
        )}
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
          <button
            onClick={() => setView('table')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${view === 'table' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Table
          </button>
          <button
            onClick={() => setView('board')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${view === 'board' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Board
          </button>
        </div>
        <button onClick={() => setImportOpen(true)} className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
          Import CSV
        </button>
        <button
          onClick={() => exportListCsv(list.id, `${list.name}.csv`)}
          className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
        >
          Export CSV
        </button>
        <button onClick={removeList} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
          Delete
        </button>
        <button onClick={onClose} aria-label="Close" className="shrink-0 text-slate-400 hover:text-slate-600">✕</button>
      </header>

      {view === 'table' ? (
        <div className="flex-1 overflow-auto p-3">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {fields.map((f) => (
                  <th key={f.id} className="sticky top-0 z-10 min-w-[160px] border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-left text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
                    <FieldHeader field={f} listId={list.id} onChanged={load} />
                  </th>
                ))}
                <th className="sticky top-0 z-10 min-w-[110px] border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/80">
                  <button
                    onClick={() => setAddingField(true)}
                    title="Add a new column, e.g. Status or Priority"
                    className="flex h-full w-full items-center justify-center gap-1 whitespace-nowrap py-2 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400"
                  >
                    + Field
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {topLevelItems.map((item) => {
                const children = childrenByParent[item.id] || [];
                const collapsed = collapsedParents.has(item.id);
                const rowProps = (it) => ({
                  key: it.id,
                  item: it,
                  fields,
                  onChanged: (patch) => setData((d) => ({ ...d, items: d.items.map((x) => (x.id === it.id ? { ...x, ...patch } : x)) })),
                  onDeleted: () => setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== it.id) })),
                });
                return (
                  <React.Fragment key={item.id}>
                    <ItemRow
                      {...rowProps(item)}
                      titleFieldId={titleField?.id}
                      childCount={children.length}
                      collapsed={collapsed}
                      onToggleCollapsed={() => toggleCollapsed(item.id)}
                      onAddSubtask={() => addSubtask(item.id)}
                    />
                    {!collapsed && children.map((child) => (
                      <ItemRow {...rowProps(child)} titleFieldId={titleField?.id} isSubtask />
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <button
            onClick={addItem}
            className="mt-1 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            + Add item
          </button>
        </div>
      ) : (
        <BoardView
          list={list}
          fields={fields}
          items={topLevelItems}
          groupFieldId={groupFieldId}
          onChangeGroupField={setGroupFieldId}
          onAddGroupField={() => setAddingField(true)}
          setData={setData}
        />
      )}

      {addingField && <AddFieldModal onCreate={addField} onClose={() => setAddingField(false)} />}
      {importOpen && (
        <ImportCsvModal
          listId={list.id}
          fields={fields}
          onDone={() => { setImportOpen(false); load(); }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </>
  );
}

const GROUPABLE_TYPES = OPTION_TYPES;   // select / status / priority

/** Kanban board — columns are one field's options (plus a "no value" catch-
 *  all), cards drag between them via native HTML5 DnD (no extra dependency).
 *  Grouping field is a local view choice, not persisted per-list, so
 *  switching between Status/Priority boards costs nothing server-side. */
function BoardView({ list, fields, items, groupFieldId, onChangeGroupField, onAddGroupField, setData }) {
  const [draggingId, setDraggingId] = useState(null);
  const groupableFields = fields.filter((f) => GROUPABLE_TYPES.includes(f.type));
  const groupField = groupableFields.find((f) => f.id === groupFieldId) || groupableFields[0];

  if (!groupField) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-slate-500">
          Board view groups items by a Status, Priority, or Dropdown field. This list doesn't have one yet.
        </p>
        <button onClick={onAddGroupField} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
          Add a Status field
        </button>
      </div>
    );
  }

  const NO_VALUE = '__none__';
  const columns = [...groupField.options, { id: NO_VALUE, label: `No ${groupField.name}`, color: '#94a3b8' }];
  const titleField = fields.find((f) => f.is_title_field) || fields[0];

  const moveItem = async (itemId, columnId) => {
    const value = columnId === NO_VALUE ? undefined : columnId;
    setData((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === itemId ? { ...it, values: { ...it.values, [groupField.id]: value } } : it)),
    }));
    try { await updateItem(itemId, { [groupField.id]: value }); } catch { /* best-effort */ }
  };

  const addToColumn = async (columnId) => {
    const value = columnId === NO_VALUE ? undefined : columnId;
    const item = await createItem(list.id, { [groupField.id]: value });
    setData((d) => ({ ...d, items: [...d.items, item] }));
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {groupableFields.length > 1 && (
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <span className="text-xs text-slate-500">Group by</span>
          <select
            value={groupField.id}
            onChange={(e) => onChangeGroupField(e.target.value)}
            className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700 outline-none dark:bg-slate-800 dark:text-slate-200"
          >
            {groupableFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      )}
      <div className="flex flex-1 gap-3 overflow-x-auto p-3">
        {columns.map((col) => {
          const colItems = items.filter((it) => (it.values?.[groupField.id] ?? NO_VALUE) === col.id);
          return (
            <div
              key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) moveItem(id, col.id); }}
              className="flex w-64 shrink-0 flex-col rounded-xl bg-slate-50 dark:bg-slate-800/60"
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: col.color }} />
                <span className="truncate text-xs font-semibold text-slate-600 dark:text-slate-300">{col.label}</span>
                <span className="ml-auto text-[11px] text-slate-400">{colItems.length}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {colItems.map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', item.id); setDraggingId(item.id); }}
                    onDragEnd={() => setDraggingId(null)}
                    className={`cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-sm transition dark:border-slate-700 dark:bg-slate-900 ${draggingId === item.id ? 'opacity-40' : ''}`}
                  >
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                      {(titleField && item.values?.[titleField.id]) || 'Untitled'}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {fields.filter((f) => f.id !== titleField?.id && f.id !== groupField.id).slice(0, 2).map((f) => {
                        const v = item.values?.[f.id];
                        if (v === undefined || v === null || v === '') return null;
                        const opt = OPTION_TYPES.includes(f.type) ? (f.options || []).find((o) => o.id === v) : null;
                        const text = opt ? opt.label : f.type === 'checkbox' ? (v ? '✓' : null) : String(v);
                        if (!text) return null;
                        return (
                          <span key={f.id} className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {text}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => addToColumn(col.id)}
                className="mx-2 mb-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-medium text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
              >
                + Add item
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FieldHeader({ field, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(field.name);

  const save = async () => {
    setEditing(false);
    if (!name.trim() || name.trim() === field.name) return;
    await updateField(field.id, { name: name.trim() });
    onChanged();
  };

  const remove = async () => {
    if (field.is_title_field) return;
    if (!confirm(`Remove the "${field.name}" column? This deletes its data from every item.`)) return;
    await deleteField(field.id);
    onChanged();
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 opacity-60">{TYPE_ICON[field.type] || '✎'}</span>
      {editing ? (
        <input
          autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()}
          className="min-w-0 flex-1 rounded bg-white px-1 py-0.5 text-xs outline-none ring-1 ring-blue-500 dark:bg-slate-900"
        />
      ) : (
        <button onClick={() => setEditing(true)} className="min-w-0 flex-1 truncate text-left hover:underline">
          {field.name}
        </button>
      )}
      {!field.is_title_field && (
        <button onClick={remove} title="Remove field" className="shrink-0 text-slate-400 hover:text-red-600">×</button>
      )}
    </div>
  );
}

function ItemRow({
  item, fields, onChanged, onDeleted, titleFieldId,
  isSubtask, childCount, collapsed, onToggleCollapsed, onAddSubtask,
}) {
  const remove = async () => {
    await deleteItem(item.id);
    onDeleted();
  };

  const setValue = async (fieldId, value) => {
    const values = { ...item.values, [fieldId]: value };
    onChanged({ values });   // optimistic
    try {
      await updateItem(item.id, { [fieldId]: value });
    } catch { /* best-effort; next load() reconciles */ }
  };

  return (
    <tr className={`group ${isSubtask ? 'bg-slate-50/60 dark:bg-slate-800/30' : ''}`}>
      {fields.map((f) => (
        <td key={f.id} className="border-b border-r border-slate-100 px-2 py-1 align-top dark:border-slate-800">
          {f.id === titleFieldId ? (
            <div className={`flex items-center gap-1 ${isSubtask ? 'pl-5' : ''}`}>
              {!isSubtask && childCount > 0 && (
                <button onClick={onToggleCollapsed} className="shrink-0 text-slate-400 hover:text-slate-600">
                  {collapsed ? '▸' : '▾'}
                </button>
              )}
              <div className="min-w-0 flex-1">
                <Cell field={f} value={item.values?.[f.id]} onChange={(v) => setValue(f.id, v)} />
              </div>
              {!isSubtask && childCount > 0 && (
                <span className="shrink-0 text-[10px] text-slate-400">{childCount}</span>
              )}
            </div>
          ) : (
            <Cell field={f} value={item.values?.[f.id]} onChange={(v) => setValue(f.id, v)} />
          )}
        </td>
      ))}
      <td className="border-b border-slate-100 px-1 py-1 text-center align-middle dark:border-slate-800">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
          {!isSubtask && (
            <button onClick={onAddSubtask} title="Add subtask" className="text-slate-300 hover:text-blue-600">＋</button>
          )}
          <button onClick={remove} title="Delete item" className="text-slate-300 hover:text-red-600">×</button>
        </div>
      </td>
    </tr>
  );
}

function Cell({ field, value, onChange }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => { setDraft(value ?? ''); }, [value]);

  const commit = () => { if (draft !== (value ?? '')) onChange(draft); };

  if (field.type === 'checkbox') {
    return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />;
  }

  if (field.type === 'date') {
    return (
      <input
        type="date" value={value || ''} onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-[120px] bg-transparent text-xs text-slate-700 outline-none dark:text-slate-200"
      />
    );
  }

  if (field.type === 'number') {
    return (
      <input
        type="number" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        className="w-full min-w-[80px] bg-transparent text-xs text-slate-700 outline-none dark:text-slate-200"
      />
    );
  }

  if (OPTION_TYPES.includes(field.type)) {
    const opt = (field.options || []).find((o) => o.id === value);
    return (
      <select
        value={value || ''} onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full min-w-[110px] rounded px-1 py-0.5 text-xs outline-none"
        style={opt ? { backgroundColor: `${opt.color}22`, color: opt.color } : undefined}
      >
        <option value="">—</option>
        {(field.options || []).map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    );
  }

  if (field.type === 'long_text') {
    return (
      <textarea
        rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        className="w-full min-w-[180px] resize-none bg-transparent text-xs text-slate-700 outline-none dark:text-slate-200"
      />
    );
  }

  // text / assignee
  return (
    <input
      value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      placeholder={field.type === 'assignee' ? 'name or email' : undefined}
      className="w-full min-w-[130px] bg-transparent text-xs text-slate-700 outline-none dark:text-slate-200"
    />
  );
}

function AddFieldModal({ onCreate, onClose }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const [optionsText, setOptionsText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const options = OPTION_TYPES.includes(type)
        ? optionsText.split('\n').map((s) => s.trim()).filter(Boolean)
        : undefined;
      await onCreate({ name: name.trim(), type, options });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Add field</h3>
        <label className="text-[11px] font-medium text-slate-500">Name</label>
        <input
          autoFocus required value={name} onChange={(e) => setName(e.target.value)}
          className="mt-0.5 mb-3 w-full rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
        />
        <label className="text-[11px] font-medium text-slate-500">Type</label>
        <select
          value={type} onChange={(e) => setType(e.target.value)}
          className="mt-0.5 mb-3 w-full rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
        >
          {FIELD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {OPTION_TYPES.includes(type) && (
          <>
            <label className="text-[11px] font-medium text-slate-500">Options (one per line)</label>
            <textarea
              rows={3} value={optionsText} onChange={(e) => setOptionsText(e.target.value)}
              placeholder={'To do\nIn progress\nDone'}
              className="mt-0.5 mb-3 w-full rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
            />
          </>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Adding…' : 'Add field'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ImportCsvModal({ listId, fields, onDone, onClose }) {
  const [rows, setRows] = useState(null);   // parsed CSV incl. header row
  const [mapping, setMapping] = useState([]);   // per column: { mode: 'existing'|'new'|'skip', fieldId?, name?, type? }
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length < 1) { setError('That file has no rows.'); return; }
      setRows(parsed);
      const header = parsed[0];
      setMapping(header.map((h) => {
        const existing = fields.find((f) => f.name.toLowerCase() === h.trim().toLowerCase());
        return existing ? { mode: 'existing', fieldId: existing.id, header: h } : { mode: 'new', name: h.trim() || 'Column', type: 'text', header: h };
      }));
    } catch {
      setError('Could not read that file.');
    }
  };

  const submit = async () => {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      const activeCols = mapping.map((m, i) => ({ m, i })).filter(({ m }) => m.mode !== 'skip');
      const columns = activeCols.map(({ m }) =>
        m.mode === 'existing' ? { fieldId: m.fieldId } : { name: m.name, type: m.type }
      );
      const dataRows = rows.slice(1).map((r) => activeCols.map(({ i }) => r[i] ?? ''));
      const result = await importListCsv(listId, { columns, rows: dataRows });
      alert(`Imported ${result.imported} item${result.imported === 1 ? '' : 's'}.`);
      onDone();
    } catch (e) {
      setError(e.message || 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Import CSV</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {!rows ? (
            <div>
              <p className="mb-3 text-xs text-slate-500">
                Each row becomes an item. The first row is used as column headers.
              </p>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile}
                className="text-xs text-slate-600 dark:text-slate-300" />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">{rows.length - 1} row{rows.length - 1 === 1 ? '' : 's'} found. Map each column below.</p>
              {mapping.map((m, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                  <span className="w-28 shrink-0 truncate text-xs font-medium text-slate-600 dark:text-slate-300">{m.header || `Column ${i + 1}`}</span>
                  <select
                    value={m.mode === 'existing' ? `existing:${m.fieldId}` : m.mode}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMapping((prev) => prev.map((row, ri) => {
                        if (ri !== i) return row;
                        if (v === 'skip') return { ...row, mode: 'skip' };
                        if (v === 'new') return { ...row, mode: 'new', name: row.header || 'Column', type: 'text' };
                        const fieldId = v.split(':')[1];
                        return { ...row, mode: 'existing', fieldId };
                      }));
                    }}
                    className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700 outline-none dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="new">Create new field</option>
                    {fields.map((f) => <option key={f.id} value={`existing:${f.id}`}>Map to: {f.name}</option>)}
                    <option value="skip">Skip this column</option>
                  </select>
                  {m.mode === 'new' && (
                    <select
                      value={m.type}
                      onChange={(e) => setMapping((prev) => prev.map((row, ri) => (ri === i ? { ...row, type: e.target.value } : row)))}
                      className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700 outline-none dark:bg-slate-800 dark:text-slate-200"
                    >
                      {FIELD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}
          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        </div>
        {rows && (
          <div className="flex justify-end gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
            <button onClick={() => { setRows(null); if (fileRef.current) fileRef.current.value = ''; }} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              Choose a different file
            </button>
            <button onClick={submit} disabled={busy} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? 'Importing…' : 'Import'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
