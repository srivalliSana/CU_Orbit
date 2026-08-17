import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { checkSession, signOut } from './api/auth';
import { getHome } from './api/chat';
import { getWorkspaces } from './api/workspaces';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';
import EmptyState from './components/EmptyState';
import NewGroupModal from './components/NewGroupModal';
import ContactPanel from './components/ContactPanel';
import ChannelInfoPanel from './components/ChannelInfoPanel';
import MentionsPanel from './components/MentionsPanel';
import ProfilePanel from './components/ProfilePanel';
import SettingsPanel from './components/SettingsPanel';
import SignInScreen from './components/SignInScreen';
import AdminPanel from './components/AdminPanel';
import UserProfileModal from './components/UserProfileModal';
import { joinChannelByLink } from './api/channels';
import { notifyMessage, permission, requestPermission, setBadge } from './lib/notify';
import { connect, disconnect, on } from './api/socket';

const DEFAULT_WORKSPACE_ID = 'default';

export default function App() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('signing-in');   // signing-in | signed-out | ready | error
  const [workspaceId, setWorkspaceId] = useState(null);   // null until the real list loads
  const [active, setActive] = useState(null);
  const [newGroup, setNewGroup] = useState(false);
  const [askNotify, setAskNotify] = useState(false);
  const [contact, setContact] = useState(null);   // { id?, email } shown in the side panel
  const [channelInfoId, setChannelInfoId] = useState(null);   // channel id shown in the side panel
  const [mentionsOpen, setMentionsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileUserId, setProfileUserId] = useState(null);   // clicked-on message sender
  const [joinBanner, setJoinBanner] = useState(null);   // result of an invite-link join attempt
  const seen = useRef(null);   // last-seen unread snapshot, for notifications
  const queryClient = useQueryClient();

  useEffect(() => {
    checkSession().then((u) => {
      if (u) { setUser(u); setStatus('ready'); }
      else setStatus('signed-out');
    });
  }, []);

  const handleSignedIn = (u) => {
    setUser(u);
    setStatus('ready');
  };

  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: getWorkspaces,
    enabled: status === 'ready',
  });

  // Today there is only ever one workspace ("cu-orbit"), so this just picks
  // it automatically; the switcher only renders as a real control if a
  // second workspace ever exists.
  useEffect(() => {
    if (workspaceId || !workspaces?.length) return;
    setWorkspaceId(workspaces[0].id);
  }, [workspaces, workspaceId]);

  const effectiveWorkspaceId = workspaceId || DEFAULT_WORKSPACE_ID;
  const homeQueryKey = ['home', effectiveWorkspaceId];
  const { data: chats } = useQuery({
    queryKey: homeQueryKey,
    queryFn: () => getHome(effectiveWorkspaceId),
    enabled: status === 'ready',
    refetchInterval: 30000,
  });
  const chatsData = chats || { channels: [], dms: [] };

  const refreshChats = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['home'] });
  }, [queryClient]);

  // A channel invite link (server.js's GET /join/:code) redirects here with
  // ?join=<code> — join once signed in, then strip the param so a refresh
  // doesn't attempt it again.
  useEffect(() => {
    if (status !== 'ready') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');
    if (!code) return;
    window.history.replaceState({}, '', window.location.pathname);
    joinChannelByLink(code)
      .then((d) => {
        refreshChats();
        if (d.pendingApproval) {
          setJoinBanner({ type: 'info', text: `Your request to join #${d.channel?.name || 'the channel'} needs admin approval.` });
        } else {
          setJoinBanner({ type: 'success', text: `Joined #${d.channel?.name || 'the channel'}.` });
          if (d.channel) setActive({ id: d.channel.id, kind: 'channel', title: `# ${d.channel.name}`, topic: d.channel.topic });
        }
      })
      .catch((e) => setJoinBanner({ type: 'error', text: e.message || 'Could not join that channel.' }));
  }, [status, refreshChats]);

  useEffect(() => {
    if (status !== 'ready' || !chats) return;
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

  // Realtime: refresh the list when something actually changes, rather than on
  // a timer. The interval in the query above is a fallback for a dropped socket.
  useEffect(() => {
    if (status !== 'ready') return;
    connect();
    const offs = [
      on('message', refreshChats),
      on('unread-changed', refreshChats),
      on('channel-added', refreshChats),
      on('presence', ({ userId, presence }) => {
        queryClient.setQueryData(homeQueryKey, (prevData) => prevData && ({
          ...prevData,
          dms: (prevData.dms || []).map((d) => (d.other_user_id === userId ? { ...d, presence } : d)),
        }));
      }),
    ];
    return () => { offs.forEach((off) => off()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, refreshChats, effectiveWorkspaceId]);

  useEffect(() => () => disconnect(), []);

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

  if (status === 'signed-out') {
    return <SignInScreen onSignedIn={handleSignedIn} />;
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-slate-100 dark:bg-slate-950">
      <ChatList
        user={user}
        chats={chatsData}
        workspaces={workspaces || []}
        workspaceId={effectiveWorkspaceId}
        onSwitchWorkspace={setWorkspaceId}
        activeId={active?.id}
        onSelect={setActive}
        onNewGroup={() => setNewGroup(true)}
        onOpenContact={(c) => { setChannelInfoId(null); setContact(c); }}
        onOpenMentions={() => setMentionsOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenAdmin={user?.role === 'admin' ? () => setAdminOpen(true) : undefined}
      />
      {active
        ? (
          <ChatWindow
            key={active.id}
            chat={active}
            user={user}
            onSent={refreshChats}
            onOpenContact={(c) => { setChannelInfoId(null); setContact(c); }}
            onOpenChannelInfo={(id) => { setContact(null); setChannelInfoId(id); }}
            onOpenProfile={(userId) => setProfileUserId(userId)}
            onBack={() => setActive(null)}
          />
        )
        : <EmptyState user={user} onNewGroup={() => setNewGroup(true)} />}

      {contact && (
        <ContactPanel
          target={contact}
          onClose={() => setContact(null)}
          onOpenChat={(chat) => { setContact(null); setActive(chat); refreshChats(); }}
        />
      )}

      {channelInfoId && (
        <ChannelInfoPanel
          channelId={channelInfoId}
          currentUser={user}
          onClose={() => setChannelInfoId(null)}
          onChanged={refreshChats}
        />
      )}

      {mentionsOpen && (
        <MentionsPanel
          onClose={() => setMentionsOpen(false)}
          onOpenChat={(chat) => setActive(chat)}
        />
      )}

      {profileOpen && (
        <ProfilePanel
          user={user}
          onClose={() => setProfileOpen(false)}
          onUpdated={(u) => setUser(u)}
          onOpenSettings={() => { setProfileOpen(false); setSettingsOpen(true); }}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onSignOut={() => { signOut(); location.reload(); }}
        />
      )}

      {adminOpen && <AdminPanel currentUser={user} onClose={() => setAdminOpen(false)} />}

      {profileUserId && (
        <UserProfileModal
          userId={profileUserId}
          currentUser={user}
          onClose={() => setProfileUserId(null)}
          onOpenChat={(chat) => { setProfileUserId(null); setActive(chat); }}
        />
      )}

      {joinBanner && (
        <div
          className={`absolute right-4 top-4 z-40 max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ${
            joinBanner.type === 'error'
              ? 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900'
              : 'bg-white text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700'
          }`}
        >
          {joinBanner.text}
          <button onClick={() => setJoinBanner(null)} className="ml-3 text-xs opacity-60 hover:opacity-100">Dismiss</button>
        </div>
      )}

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
          workspaceId={effectiveWorkspaceId}
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
