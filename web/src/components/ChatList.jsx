import React, { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar';
import { timeLabel } from '../lib/format';
import { searchDirectory, searchMessages } from '../api/chat';
import { isFacultyEmail } from '../lib/permissions';

/** Left pane: search, then channels and direct messages. */

export default function ChatList({ user, chats, workspaces, workspaceId, onSwitchWorkspace, activeId, onSelect, onNewGroup, onOpenContact, onOpenMentions, onOpenProfile }) {
  // Mirrors isFacultyEmail() on the server. The server is the authority for
  // channel creation; this only avoids showing an action that would 403.
  const canCreate = user?.role === 'admin' || isFacultyEmail(user?.campus_email || user?.email);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');   // all | channels | dms
  const [people, setPeople] = useState([]);
  const [searching, setSearching] = useState(false);
  const [messageResults, setMessageResults] = useState([]);
  const searchSeq = useRef(0);

  // Search the campus directory, plus message content, as well as open
  // conversations, so anyone/anything at the university can be found — not
  // only people/chats already open. Debounced, and stale responses are
  // discarded so a slow reply cannot overwrite a newer one.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setPeople([]); setMessageResults([]); setSearching(false); return; }

    setSearching(true);
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      Promise.all([
        searchDirectory(term).catch(() => ({ results: [] })),
        searchMessages(term).catch(() => []),
      ]).then(([dirResult, msgResults]) => {
        if (seq !== searchSeq.current) return;
        setPeople(dirResult.results || []);
        setMessageResults(msgResults);
      }).finally(() => { if (seq === searchSeq.current) setSearching(false); });
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
        <button onClick={onOpenProfile} aria-label="Your profile" className="shrink-0 rounded-full">
          <Avatar name={user?.name} url={user?.avatarUrl} size={40} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{user?.name || 'You'}</p>
          {workspaces?.length > 1 ? (
            <select
              value={workspaceId}
              onChange={(e) => onSwitchWorkspace(e.target.value)}
              aria-label="Workspace"
              className="mt-0.5 w-full truncate rounded bg-transparent text-xs text-slate-500 outline-none"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          ) : (
            <p className="truncate text-xs text-slate-500">{user?.campus_email || user?.email}</p>
          )}
        </div>
        <button
          onClick={onOpenMentions}
          title="Mentions"
          aria-label="Mentions"
          className="shrink-0 rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
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

        {q.trim().length >= 2 && messageResults.length > 0 && (
          <Section title="Messages">
            {messageResults.map((r) => {
              const isDm = r.container_id.includes('_');
              // The search endpoint only returns who sent the matched
              // message, not the container's own name — resolve the real
              // channel/DM title from what's already loaded rather than
              // showing the sender's name as if it were the chat's title.
              const known = isDm
                ? (chats.dms || []).find((d) => d.id === r.container_id)
                : (chats.channels || []).find((c) => c.id === r.container_id);
              const title = isDm
                ? (known?.other_user_name || r.sender_name)
                : `# ${known?.name || r.sender_name}`;
              return (
                <button
                  key={r.id}
                  onClick={() => onSelect({ id: r.container_id, kind: isDm ? 'dm' : 'channel', title })}
                  className="flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{title}</span>
                  <span className="line-clamp-2 text-xs text-slate-500">
                    <b>{r.sender_name}:</b> {r.text}
                  </span>
                </button>
              );
            })}
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
