import React, { useEffect, useState } from 'react';
import Avatar from './Avatar';
import SharedMediaPanel from './SharedMediaPanel';
import {
  addChannelMember,
  approveJoinRequest,
  bulkAddChannelMembers,
  getAvailableApps,
  getChannel,
  getChannelMembers,
  getJoinRequests,
  inviteByEmail,
  rejectJoinRequest,
  removeChannelMember,
  updateChannel,
} from '../api/channels';
import { getPinnedMessages, getStarredMessages, listUsers, uploadFile } from '../api/chat';
import { setChannelActive } from '../api/admin';

/**
 * Channel details: topic, members (with role management), and the
 * WhatsApp-style permission toggles. Mirrors ContactPanel's overlay shape.
 *
 * Permission rules are enforced server-side (see isFacultyEmail() and the
 * creator-protection checks in server/server.js) — this UI just reflects
 * what the server will actually allow, showing its rejection reason rather
 * than guessing who's allowed to do what.
 */
export default function ChannelInfoPanel({ channelId, currentUser, onClose, onChanged, onJumpToMessage, onOpenProfile }) {
  const [channel, setChannel] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [addingApp, setAddingApp] = useState(false);
  const [availableApps, setAvailableApps] = useState([]);
  const [busyUserId, setBusyUserId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitingByEmail, setInvitingByEmail] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [joinRequests, setJoinRequests] = useState([]);
  const [busyRequestId, setBusyRequestId] = useState(null);
  const [view, setView] = useState('main');   // main | media | pinned | starred
  const [listItems, setListItems] = useState(null);
  const [togglingActive, setTogglingActive] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const load = () => {
    setError(null);
    Promise.all([getChannel(channelId), getChannelMembers(channelId)])
      .then(([ch, mem]) => {
        setChannel(ch);
        setMembers(mem);
        const amAdmin = mem.find((m) => m.id === currentUser?.id)?.role === 'admin';
        if (amAdmin || currentUser?.role === 'admin') {
          getJoinRequests(channelId).then(setJoinRequests).catch(() => setJoinRequests([]));
        }
      })
      .catch((e) => setError(e.message || 'Could not load this channel.'));
  };

  useEffect(() => {
    setChannel(null);
    setMembers([]);
    setJoinRequests([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const myMembership = members.find((m) => m.id === currentUser?.id);
  const isChannelAdmin = myMembership?.role === 'admin';
  const isSuperAdmin = currentUser?.role === 'admin';
  const isCreator = (id) => channel?.created_by === id;

  useEffect(() => {
    if (view === 'main' || view === 'media') return;
    setListItems(null);
    const fetcher = view === 'pinned' ? getPinnedMessages(channelId) : getStarredMessages(channelId);
    fetcher.then(setListItems).catch(() => setListItems([]));
  }, [view, channelId]);

  const toggleChannelActive = async () => {
    const active = channel.is_active === false;   // currently inactive → reactivating
    if (!active && !window.confirm(`Deactivate #${channel.name}? No one will be able to see or message in it until you reactivate it.`)) return;
    setTogglingActive(true);
    try {
      const { channel: updated } = await setChannelActive(channelId, active);
      setChannel(updated);
      onChanged?.();
    } catch (e) {
      setError(e.message || 'Could not update this channel.');
    } finally {
      setTogglingActive(false);
    }
  };

  const respondToRequest = async (reqId, approve) => {
    setBusyRequestId(reqId);
    try {
      await (approve ? approveJoinRequest : rejectJoinRequest)(channelId, reqId);
      setJoinRequests((prev) => prev.filter((r) => r.id !== reqId));
      if (approve) { load(); onChanged?.(); }
    } catch (e) {
      setError(e.message || 'Could not update that request.');
    } finally {
      setBusyRequestId(null);
    }
  };

  const startAdding = () => {
    setAdding(true);
    setCandidateSearch('');
    listUsers()
      .then((list) => {
        const memberIds = new Set(members.map((m) => m.id));
        setCandidates(list.filter((u) => !memberIds.has(u.id)));
      })
      .catch(() => setCandidates([]));
  };

  const addMember = async (userId) => {
    setBusyUserId(userId);
    try {
      await addChannelMember(channelId, userId);
      load();
      onChanged?.();
      setAdding(false);
      setCandidateSearch('');
    } catch (e) {
      setError(e.message || 'Could not add that person.');
    } finally {
      setBusyUserId(null);
    }
  };

  // CSV is parsed client-side (one email per line, a header row like
  // "email" is skipped, anything after a comma on a line is ignored so a
  // 2-column export still works) — the server only ever sees a plain email
  // list, same payload shape as the single-add call above.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const bulkAddCsv = async (file) => {
    if (!file) return;
    setBulkResult(null);
    setBulkBusy(true);
    try {
      const text = await file.text();
      const emails = text
        .split(/\r?\n/)
        .map((line) => line.split(',')[0].trim().toLowerCase())
        .filter((email) => email && EMAIL_RE.test(email) && email !== 'email');
      if (!emails.length) {
        setError('No email addresses found in that file.');
        return;
      }
      const result = await bulkAddChannelMembers(channelId, emails);
      setBulkResult(result);
      load();
      onChanged?.();
    } catch (e) {
      setError(e.message || 'Could not bulk-add from that file.');
    } finally {
      setBulkBusy(false);
    }
  };

  const startAddingApp = () => {
    setAddingApp(true);
    getAvailableApps(channelId).then(setAvailableApps).catch(() => setAvailableApps([]));
  };

  // A bot is just a User row (is_bot: true) — adding one to a channel is
  // the exact same membership call as adding a person.
  const addApp = async (botUserId) => {
    setBusyUserId(botUserId);
    try {
      await addChannelMember(channelId, botUserId);
      load();
      onChanged?.();
      setAddingApp(false);
    } catch (e) {
      setError(e.message || 'Could not add that app.');
    } finally {
      setBusyUserId(null);
    }
  };

  const removeMember = async (userId) => {
    setBusyUserId(userId);
    try {
      await removeChannelMember(channelId, userId);
      load();
      onChanged?.();
    } catch (e) {
      setError(e.message || 'Could not remove that person.');
    } finally {
      setBusyUserId(null);
    }
  };

  const leaveChannel = async () => {
    if (!currentUser?.id) return;
    if (!window.confirm(`Leave ${channel?.name ? `#${channel.name}` : 'this channel'}?`)) return;
    setBusyUserId(currentUser.id);
    setError(null);
    try {
      await removeChannelMember(channelId, currentUser.id);
      onChanged?.();
      onClose?.();
    } catch (e) {
      setError(e.message || 'Could not leave that channel.');
    } finally {
      setBusyUserId(null);
    }
  };

  const setRole = async (userId, role) => {
    setBusyUserId(userId);
    try {
      await addChannelMember(channelId, userId, role);
      load();
    } catch (e) {
      setError(e.message || 'Could not change that role.');
    } finally {
      setBusyUserId(null);
    }
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    setError(null);
    setInvitingByEmail(true);
    try {
      await inviteByEmail(channelId, inviteEmail.trim().toLowerCase());
      setInviteEmail('');
      setInviteSent(true);
      setTimeout(() => setInviteSent(false), 2500);
    } catch (e) {
      setError(e.message || 'Could not send that invite.');
    } finally {
      setInvitingByEmail(false);
    }
  };

  const toggle = async (field, value) => {
    setError(null);
    try {
      const updated = await updateChannel(channelId, { [field]: value });
      setChannel(updated);
    } catch (e) {
      setError(e.message || 'Could not update that setting.');
    }
  };

  const startEditingInfo = () => {
    setNameInput(channel?.name || '');
    setTopicInput(channel?.topic || '');
    setEditingInfo(true);
  };

  const saveInfo = async () => {
    setSavingInfo(true);
    setError(null);
    try {
      const updated = await updateChannel(channelId, { name: nameInput.trim(), topic: topicInput.trim() });
      setChannel(updated);
      onChanged?.();
      setEditingInfo(false);
    } catch (e) {
      setError(e.message || 'Could not save channel info.');
    } finally {
      setSavingInfo(false);
    }
  };

  const changeAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingAvatar(true);
    setError(null);
    try {
      const { url } = await uploadFile(file);
      const updated = await updateChannel(channelId, { avatar_url: url });
      setChannel(updated);
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Could not update the channel photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <aside className="fixed inset-0 z-30 flex w-full flex-col bg-paper2 dark:bg-slate-900 md:static md:z-auto md:w-full md:max-w-sm md:shrink-0 md:border-l md:border-slate-200 md:dark:border-slate-800">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        {view !== 'main' ? (
          <button onClick={() => setView('main')} className="text-sm font-medium text-accent-600 hover:text-accent-700">
            ← Back
          </button>
        ) : (
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Channel info</h2>
        )}
        <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
      </header>

      {view === 'media' && (
        <div className="flex-1 overflow-y-auto p-5">
          <SharedMediaPanel containerId={channelId} onJumpToMessage={onJumpToMessage} />
        </div>
      )}

      {(view === 'pinned' || view === 'starred') && (
        <div className="flex-1 overflow-y-auto p-5">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {view === 'pinned' ? 'Pinned messages' : 'Starred messages'}
          </h4>
          {listItems === null && <p className="text-sm text-slate-400">Loading…</p>}
          {listItems && listItems.length === 0 && <p className="text-sm text-slate-400">Nothing here yet.</p>}
          <ul className="space-y-2">
            {(listItems || []).map((it) => (
              <li
                key={it.id}
                onClick={() => onJumpToMessage?.(it.id)}
                className="cursor-pointer rounded-lg bg-slate-50 p-2.5 text-sm hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <p className="text-xs font-semibold text-slate-500">{it.sender_name}</p>
                <p className="truncate text-slate-700 dark:text-slate-200">{it.text || 'Attachment'}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={`flex-1 overflow-y-auto p-5 ${view !== 'main' ? 'hidden' : ''}`}>
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        {!channel && !error && <p className="text-sm text-slate-400">Loading…</p>}

        {channel && (
          <>
            <div className="flex flex-col items-center text-center">
              {isChannelAdmin || isSuperAdmin ? (
                <label className="group relative cursor-pointer">
                  <Avatar name={channel.name} url={channel.avatar_url} kind="channel" size={84} />
                  <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-accent-600 text-[11px] text-white ring-2 ring-white dark:ring-slate-900">
                    {uploadingAvatar ? '…' : '📷'}
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={changeAvatar} disabled={uploadingAvatar} />
                </label>
              ) : (
                <Avatar name={channel.name} url={channel.avatar_url} kind="channel" size={84} />
              )}

              {editingInfo ? (
                <div className="mt-3 w-full space-y-2 text-left">
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Channel name"
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-center text-sm outline-none focus:ring-2 focus:ring-accent-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <textarea
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    placeholder="What's this channel about?"
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-center text-xs outline-none focus:ring-2 focus:ring-accent-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <div className="flex justify-center gap-2">
                    <button onClick={() => setEditingInfo(false)} disabled={savingInfo} className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                      Cancel
                    </button>
                    <button onClick={saveInfo} disabled={savingInfo || !nameInput.trim()} className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50">
                      {savingInfo ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="mt-3 text-lg font-bold text-slate-800 dark:text-slate-100"># {channel.name}</h3>
                  <p className="mt-1 text-xs text-slate-400">{channel.member_count} member{channel.member_count === 1 ? '' : 's'}</p>
                  {channel.topic && <p className="mt-2 max-w-xs text-sm text-slate-500">{channel.topic}</p>}
                  {isChannelAdmin || isSuperAdmin ? (
                    <button onClick={startEditingInfo} className="mt-2 text-xs font-medium text-accent-600 hover:text-accent-700">
                      Edit name & topic
                    </button>
                  ) : null}
                </>
              )}
            </div>

            <div className="mt-5 flex justify-center gap-3">
              <QuickAction icon="🖼️" label="Media" onClick={() => setView('media')} />
              <QuickAction icon="📌" label="Pinned" onClick={() => setView('pinned')} />
              <QuickAction icon="⭐" label="Starred" onClick={() => setView('starred')} />
              {(isChannelAdmin || isSuperAdmin) && (
                <QuickAction icon="＋" label="Add" onClick={startAdding} />
              )}
            </div>

            {(isChannelAdmin || isSuperAdmin) && (
              <Section label="Invite">
                <Card>
                  <div className="p-3.5">
                    <p className="text-[11px] text-slate-400">
                      Anyone with a cutm.ac.in or cutmap.ac.in account can join with this link, shared anywhere.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        readOnly
                        value={`${window.location.origin}/join/${channel.invite_code}`}
                        onFocus={(e) => e.target.select()}
                        className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(`${window.location.origin}/join/${channel.invite_code}`);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        }}
                        className="shrink-0 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700"
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                  <div className="border-t border-slate-200 p-3.5 dark:border-slate-700/60">
                    <p className="text-[11px] text-slate-400">Invite by email — sends the join link to their campus email.</p>
                    <form onSubmit={sendInvite} className="mt-2 flex items-center gap-2">
                      <input
                        type="email"
                        required
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="name@cutm.ac.in"
                        className="min-w-0 flex-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-accent-500/40 dark:bg-slate-900 dark:text-slate-200"
                      />
                      <button
                        type="submit"
                        disabled={invitingByEmail}
                        className="shrink-0 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                      >
                        {invitingByEmail ? 'Sending…' : inviteSent ? 'Sent ✓' : 'Send'}
                      </button>
                    </form>
                  </div>
                </Card>
              </Section>
            )}

            {joinRequests.length > 0 && (
              <Section label={`Join requests · ${joinRequests.length}`}>
                <Card>
                  {joinRequests.map((r, i) => (
                    <div key={r.id} className={`flex items-center gap-3 p-3 ${i > 0 ? 'border-t border-slate-200 dark:border-slate-700/60' : ''}`}>
                      <Avatar name={r.userName} size={32} />
                      <p className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{r.userName}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          disabled={busyRequestId === r.id}
                          onClick={() => respondToRequest(r.id, true)}
                          className="text-[11px] font-medium text-accent-600 hover:text-accent-700 disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          disabled={busyRequestId === r.id}
                          onClick={() => respondToRequest(r.id, false)}
                          className="text-[11px] text-red-500 hover:text-red-600 disabled:opacity-40"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </Card>
              </Section>
            )}

            <Section
              label={`Members · ${members.length}`}
              action={
                (isChannelAdmin || isSuperAdmin) && (
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer text-xs font-medium text-accent-600 hover:text-accent-700">
                      {bulkBusy ? 'Adding…' : 'Bulk add (CSV)'}
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        disabled={bulkBusy}
                        onChange={(e) => { bulkAddCsv(e.target.files?.[0]); e.target.value = ''; }}
                        className="hidden"
                      />
                    </label>
                    <button onClick={startAdding} className="text-xs font-medium text-accent-600 hover:text-accent-700">
                      + Add
                    </button>
                  </div>
                )
              }
            >
              {bulkResult && (
                <p className="mb-2 text-[11px] text-slate-400">
                  {bulkResult.added.length} added, {bulkResult.skipped.length} skipped
                  {bulkResult.skipped.length > 0 && ` (${bulkResult.skipped.slice(0, 3).map((s) => s.email).join(', ')}${bulkResult.skipped.length > 3 ? '…' : ''} — not a staff/faculty campus email, or already a member)`}
                </p>
              )}

              {members.length > 6 && (
                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search members"
                  className="mb-2 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:text-slate-200"
                />
              )}

              {adding && (
                <div className="mb-2">
                  <input
                    autoFocus
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                    placeholder="Search people to add"
                    className="w-full rounded-lg border border-slate-200 bg-transparent px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:text-slate-200"
                  />
                  <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    {(() => {
                      const q = candidateSearch.trim().toLowerCase();
                      const filtered = q
                        ? candidates.filter((c) => c.name?.toLowerCase().includes(q) || (c.campus_email || c.email || '').toLowerCase().includes(q))
                        : candidates;
                      if (filtered.length === 0) {
                        return <p className="p-3 text-xs text-slate-400">No one else to add.</p>;
                      }
                      return filtered.map((c) => (
                        <button
                          key={c.id}
                          disabled={busyUserId === c.id}
                          onClick={() => addMember(c.id)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-40 dark:hover:bg-slate-800"
                        >
                          <Avatar name={c.name} url={c.avatarUrl} size={28} />
                          <span className="truncate text-sm text-slate-700 dark:text-slate-200">{c.name}</span>
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              )}

              <Card>
                {members
                  .filter((m) => m.name?.toLowerCase().includes(memberSearch.trim().toLowerCase()))
                  .map((m, i) => (
                  <div key={m.id} className={`flex items-center gap-3 p-3 ${i > 0 ? 'border-t border-slate-200 dark:border-slate-700/60' : ''}`}>
                    <button
                      onClick={() => onOpenProfile?.(m.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <Avatar name={m.name} url={m.avatarUrl} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-700 dark:text-slate-200">
                          {m.name}
                          {m.is_bot && (
                            <span className="ml-1.5 rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-600 dark:bg-violet-900/40 dark:text-violet-300">
                              App
                            </span>
                          )}
                          {isCreator(m.id) && <span className="ml-1.5 text-[10px] text-slate-400">creator</span>}
                        </p>
                        {m.role === 'admin' && <p className="text-[11px] text-accent-500">Admin</p>}
                      </div>
                    </button>
                    {isChannelAdmin && !isCreator(m.id) && m.id !== currentUser?.id && (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          disabled={busyUserId === m.id}
                          onClick={() => setRole(m.id, m.role === 'admin' ? 'member' : 'admin')}
                          className="text-[11px] text-slate-500 hover:text-slate-700 disabled:opacity-40"
                        >
                          {m.role === 'admin' ? 'Demote' : 'Make admin'}
                        </button>
                        <button
                          disabled={busyUserId === m.id}
                          onClick={() => removeMember(m.id)}
                          className="text-[11px] text-red-500 hover:text-red-600 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            </Section>

            {isChannelAdmin && (
              <Section label="Settings">
                <Card>
                  <div className="space-y-3 p-3.5">
                    <ToggleRow
                      label="Only admins can post"
                      checked={!!channel.restricted_messaging}
                      onChange={(v) => toggle('restricted_messaging', v)}
                    />
                    <ToggleRow
                      label="Only admins can edit channel info"
                      checked={!!channel.info_edit_restricted}
                      onChange={(v) => toggle('info_edit_restricted', v)}
                    />
                    <ToggleRow
                      label="Approval required to join"
                      checked={!!channel.approval_required}
                      onChange={(v) => toggle('approval_required', v)}
                    />
                  </div>
                </Card>
              </Section>
            )}

            {(isChannelAdmin || isSuperAdmin) && (
              <Section
                label="Apps"
                action={
                  <button onClick={startAddingApp} className="text-xs font-medium text-accent-600 hover:text-accent-700">
                    + Add app
                  </button>
                }
              >
                {addingApp && (
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    {availableApps.length === 0 && (
                      <p className="p-3 text-xs text-slate-400">No installed apps to add — register or install one from Admin → Apps first.</p>
                    )}
                    {availableApps.map((a) => (
                      <button
                        key={a.installation_id}
                        disabled={busyUserId === a.bot_user_id}
                        onClick={() => addApp(a.bot_user_id)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-40 dark:hover:bg-slate-800"
                      >
                        <Avatar name={a.bot?.name || a.app_name} url={a.bot?.avatarUrl} size={28} />
                        <span className="truncate text-sm text-slate-700 dark:text-slate-200">{a.app_name || a.bot?.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </Section>
            )}

            <Section label="Danger zone" labelClass="text-red-500 dark:text-red-400">
              <Card className="border-red-200 dark:border-red-900/60">
                {!isCreator(currentUser?.id) && (
                  <NavRow
                    icon="🚪"
                    label="Leave channel"
                    onClick={leaveChannel}
                    disabled={busyUserId === currentUser?.id}
                    danger
                  />
                )}
                {isChannelAdmin && (
                  <>
                    {channel.archived_at && (
                      <p className="mx-3.5 mt-3 rounded-lg bg-slate-100 px-2.5 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        This channel is archived — everyone can still read its history, but no one can post until it's unarchived.
                      </p>
                    )}
                    <NavRow
                      icon={channel.archived_at ? '📤' : '🗄️'}
                      label={channel.archived_at ? 'Unarchive channel' : 'Archive channel'}
                      onClick={() => toggle('archived', !channel.archived_at)}
                      danger
                      divider={!isCreator(currentUser?.id)}
                    />
                  </>
                )}
                {isSuperAdmin && (
                  <>
                    {channel.is_active === false && (
                      <p className="mx-3.5 mt-3 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        This channel is deactivated — hidden from members, and no one can message here until you reactivate it.
                      </p>
                    )}
                    <NavRow
                      icon={channel.is_active === false ? '✅' : '🚫'}
                      label={togglingActive ? 'Updating…' : channel.is_active === false ? 'Reactivate channel' : 'Deactivate channel'}
                      onClick={toggleChannelActive}
                      disabled={togglingActive}
                      danger={channel.is_active !== false}
                      divider={!isCreator(currentUser?.id) || isChannelAdmin}
                    />
                  </>
                )}
              </Card>
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}

function QuickAction({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex w-16 flex-col items-center gap-1.5">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-base dark:border-slate-700 dark:bg-slate-800/60">
        {icon}
      </span>
      <span className="text-[10px] font-semibold text-slate-400">{label}</span>
    </button>
  );
}

function Section({ label, labelClass, action, children }) {
  return (
    <div className="mt-5">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className={`text-[11px] font-bold uppercase tracking-wide text-slate-400 ${labelClass || ''}`}>{label}</h4>
        {action || null}
      </div>
      {children}
    </div>
  );
}

function Card({ className = '', children }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800/40 ${className}`}>
      {children}
    </div>
  );
}

function NavRow({ icon, label, onClick, disabled, danger, divider }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 p-3.5 text-left text-sm font-medium disabled:opacity-40 ${
        divider ? 'border-t border-slate-200 dark:border-slate-700/60' : ''
      } ${danger ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200'}`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm ${
          danger ? 'bg-red-100 dark:bg-red-950/40' : 'bg-accent-50 dark:bg-accent-900/20'
        }`}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
    </label>
  );
}
