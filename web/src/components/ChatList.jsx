import React, { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar';
import { timeLabel } from '../lib/format';
import { searchDirectory } from '../api/chat';

/** Left pane: search, then channels and direct messages. */
// Mirrors GROUP_CREATE_ROLES on the server. The server is the authority; this
// only avoids showing an action that would be refused.
const CAN_CREATE_GROUPS = ['faculty', 'admin', 'examcell', 'coordinator'];

export default function ChatList({ user, chats, activeId, onSelect, onNewGroup, onOpenContact }) {
  const canCreate = CAN_CREATE_GROUPS.includes(user?.role);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');   // all | channels | dms
  const [people, setPeople] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  // Search the campus directory as well as open conversations, so anyone at the
  // university can be found — not only people already messaged. Debounced, and
  // stale responses are discarded so a slow reply cannot overwrite a newer one.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setPeople([]); setSearching(false); return; }

    setSearching(true);
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      searchDirectory(term)
        .then((d) => {
          if (seq !== searchSeq.current) return;
          setPeople(d.results || []);
        })
        .catch(() => { if (seq === searchSeq.current) setPeople([]); })
        .finally(() => { if (seq === searchSeq.current) setSearching(false); });
    }, 250);

    return () => clearTimeout(timer);
  }, [q]);

  const { channels, dms } = useMemo(() => {
    const term = q.trim().toLowerCase();
    const match = (s) => !term || (s || '').toLowerCase().includes(term);
    return {
      channels: (chats.channels || []).filter((c) => match(c.name)),
      dms: (chats.dms || []).filter((d) => match(d.other_user_name)),
    };
  }, [chats, q]);

  const showChannels = tab !== 'dms' && channels.length > 0;
  const showDms = tab !== 'channels' && dms.length > 0;
  const nothing = !showChannels && !showDms;

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <Avatar name={user?.name} url={user?.avatarUrl} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{user?.name || 'You'}</p>
          <p className="truncate text-xs text-slate-500">{user?.campus_email || user?.email}</p>
        </div>
        {canCreate && <button
          onClick={onNewGroup}
          title="New group"
          aria-label="New group"
          className="shrink-0 rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6" />
          </svg>
        </button>}
      </header>

      <div className="px-3 py-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          aria-label="Search conversations"
          className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm outline-none ring-blue-500/40 placeholder:text-slate-400 focus:ring-2 dark:bg-slate-800 dark:text-slate-100"
        />
        <div className="mt-2 flex gap-1">
          {['all', 'channels', 'dms'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                tab === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {t === 'dms' ? 'Direct' : t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {nothing && (
          <p className="px-4 py-8 text-center text-sm text-slate-400">
            {q ? 'No conversations match your search.' : 'No conversations yet.'}
          </p>
        )}

        {q.trim().length >= 2 && (
          <Section title={searching ? 'People · searching…' : 'People'}>
            {!searching && people.length === 0 && (
              <p className="px-4 py-3 text-xs text-slate-400">Nobody in the campus directory matches.</p>
            )}
            {people.map((p) => (
              <button
                key={p.email}
                onClick={() => onOpenContact({ id: p.id, email: p.email })}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <Avatar name={p.name} url={p.avatarUrl} presence={p.presence} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{p.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[p.role, p.department || p.cohort].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {!p.in_orbit && <span className="shrink-0 text-[10px] text-slate-400">not on Orbit</span>}
              </button>
            ))}
          </Section>
        )}

        {showChannels && (
          <Section title="Channels">
            {channels.map((c) => (
              <Row
                key={c.id}
                active={activeId === c.id}
                onClick={() => onSelect({ id: c.id, kind: 'channel', title: `# ${c.name}`, topic: c.topic })}
                avatar={<Avatar name={c.name} kind="channel" size={44} />}
                title={`# ${c.name}`}
                preview={preview(c.last_message_preview)}
                time={c.last_message_preview?.sent_at}
                unread={c.unread_count}
                mention={c.has_unread_mention}
              />
            ))}
          </Section>
        )}

        {showDms && (
          <Section title="Direct messages">
            {dms.map((d) => (
              <Row
                key={d.id}
                active={activeId === d.id}
                onClick={() => onSelect({ id: d.id, kind: 'dm', title: d.other_user_name, presence: d.presence })}
                avatar={<Avatar name={d.other_user_name} url={d.other_user_avatar_url} presence={d.presence} size={44} />}
                title={d.other_user_name}
                preview={preview(d.last_message_preview)}
                time={d.last_message_preview?.sent_at}
                unread={d.unread_count}
                mention={d.has_unread_mention}
              />
            ))}
          </Section>
        )}
      </div>
    </aside>
  );
}

function preview(p) {
  if (!p) return 'No messages yet';
  const label = { image: '📷 Photo', voice: '🎤 Voice message', file: '📎 Attachment' }[p.type];
  const text = label || p.text || '';
  return p.sender_is_self ? `You: ${text}` : text;
}

const Section = ({ title, children }) => (
  <section>
    <h2 className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
    {children}
  </section>
);

function Row({ active, onClick, avatar, title, preview, time, unread, mention }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
        active ? 'bg-blue-50 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
      }`}
    >
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{title}</p>
          {time ? <span className="shrink-0 text-[11px] text-slate-400">{timeLabel(time)}</span> : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs text-slate-500">{preview}</p>
          <span className="flex shrink-0 items-center gap-1">
            {mention ? <span className="text-xs font-bold text-red-500">@</span> : null}
            {unread > 0 ? (
              <span className="rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </span>
        </div>
      </div>
    </button>
  );
}
