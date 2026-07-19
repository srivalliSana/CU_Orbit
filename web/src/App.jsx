import React, { useCallback, useEffect, useRef, useState } from 'react';
import { signIn } from './api/auth';
import { getHome } from './api/chat';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';
import EmptyState from './components/EmptyState';
import NewGroupModal from './components/NewGroupModal';
import { notifyMessage, permission, requestPermission, setBadge } from './lib/notify';

export default function App() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('signing-in');   // signing-in | ready | error
  const [error, setError] = useState(null);
  const [chats, setChats] = useState({ channels: [], dms: [] });
  const [active, setActive] = useState(null);
  const [newGroup, setNewGroup] = useState(false);
  const [askNotify, setAskNotify] = useState(false);
  const seen = useRef(null);   // last-seen unread snapshot, for notifications

  useEffect(() => {
    signIn()
      .then((u) => {
        if (!u) return;              // standalone redirect in flight
        setUser(u);
        setStatus('ready');
      })
      .catch((e) => { setError(e.message); setStatus('error'); });
  }, []);

  const refreshChats = useCallback(() => {
    getHome().then(setChats).catch(() => {});
  }, []);

  useEffect(() => { if (status === 'ready') refreshChats(); }, [status, refreshChats]);

  useEffect(() => {
    if (status !== 'ready') return;
    const rows = [...(chats.channels || []), ...(chats.dms || [])];
    const total = rows.reduce((n, r) => n + (r.unread_count || 0), 0);
    setBadge(total);

    const prev = seen.current;
    const now = Object.fromEntries(rows.map((r) => [r.id, r.unread_count || 0]));
    // Skip the first pass: on load every existing unread would fire at once.
    if (prev) {
      for (const r of rows) {
        const before = prev[r.id] ?? 0;
        const after = now[r.id] ?? 0;
        if (after <= before || r.id === active?.id) continue;
        const isChannel = 'name' in r;
        notifyMessage({
          title: isChannel ? `# ${r.name}` : r.other_user_name,
          body: r.last_message_preview?.text || 'New message',
          tag: r.id,
          onClick: () => setActive(
            isChannel
              ? { id: r.id, kind: 'channel', title: `# ${r.name}`, topic: r.topic }
              : { id: r.id, kind: 'dm', title: r.other_user_name, presence: r.presence }
          ),
        });
      }
    }
    seen.current = now;
  }, [chats, status, active?.id]);

  useEffect(() => {
    if (status === 'ready' && permission() === 'default') setAskNotify(true);
  }, [status]);

  // Until the realtime layer lands, the chat list refreshes on a slow interval.
  // The open conversation polls faster, inside ChatWindow.
  useEffect(() => {
    if (status !== 'ready') return;
    const t = setInterval(refreshChats, 10000);
    return () => clearInterval(t);
  }, [status, refreshChats]);

  if (status === 'signing-in') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <p className="text-sm text-slate-500">Connecting to CU Orbit…</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <div className="max-w-sm text-center">
          <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">Can’t open messaging</p>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <button
            onClick={() => location.reload()}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-slate-100 dark:bg-slate-950">
      <ChatList
        user={user}
        chats={chats}
        activeId={active?.id}
        onSelect={setActive}
        onNewGroup={() => setNewGroup(true)}
      />
      {active
        ? <ChatWindow key={active.id} chat={active} user={user} onSent={refreshChats} />
        : <EmptyState user={user} onNewGroup={() => setNewGroup(true)} />}

      {askNotify && (
        <div className="absolute bottom-4 left-4 z-40 flex max-w-sm items-center gap-3 rounded-xl bg-white p-3 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          <span className="text-sm text-slate-700 dark:text-slate-200">Get notified about new messages?</span>
          <button
            onClick={async () => { await requestPermission(); setAskNotify(false); }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Enable
          </button>
          <button onClick={() => setAskNotify(false)} className="text-xs text-slate-400 hover:text-slate-600">Not now</button>
        </div>
      )}

      {newGroup && (
        <NewGroupModal
          user={user}
          onClose={() => setNewGroup(false)}
          onCreated={(channel) => {
            setNewGroup(false);
            refreshChats();
            // Open the new group straight away, as WhatsApp does.
            setActive({ id: channel.id, kind: 'channel', title: `# ${channel.name}`, topic: channel.topic });
          }}
        />
      )}
    </div>
  );
}
