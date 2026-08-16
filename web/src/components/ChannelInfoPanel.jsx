import React, { useEffect, useState } from 'react';
import Avatar from './Avatar';
import {
  addChannelMember,
  approveJoinRequest,
  getChannel,
  getChannelMembers,
  getJoinRequests,
  inviteByEmail,
  rejectJoinRequest,
  removeChannelMember,
  updateChannel,
} from '../api/channels';
import { listUsers } from '../api/chat';

/**
 * Channel details: topic, members (with role management), and the
 * WhatsApp-style permission toggles. Mirrors ContactPanel's overlay shape.
 *
 * Permission rules are enforced server-side (see isFacultyEmail() and the
 * creator-protection checks in server/server.js) — this UI just reflects
 * what the server will actually allow, showing its rejection reason rather
 * than guessing who's allowed to do what.
 */
export default function ChannelInfoPanel({ channelId, currentUser, onClose, onChanged }) {
  const [channel, setChannel] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [busyUserId, setBusyUserId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitingByEmail, setInvitingByEmail] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [joinRequests, setJoinRequests] = useState([]);
  const [busyRequestId, setBusyRequestId] = useState(null);

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
  const isCreator = (id) => channel?.created_by === id;

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
    } catch (e) {
      setError(e.message || 'Could not add that person.');
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

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Channel info</h2>
        <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        {!channel && !error && <p className="text-sm text-slate-400">Loading…</p>}

        {channel && (
          <>
            <div className="flex flex-col items-center text-center">
              <Avatar name={channel.name} kind="channel" size={72} />
              <h3 className="mt-3 text-lg font-semibold text-slate-800 dark:text-slate-100"># {channel.name}</h3>
              {channel.topic && <p className="mt-1 text-sm text-slate-500">{channel.topic}</p>}
              <p className="mt-1 text-xs text-slate-400">{channel.member_count} member{channel.member_count === 1 ? '' : 's'}</p>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invite link</h4>
              <p className="mt-1 text-[11px] text-slate-400">
                Anyone with a cutm.ac.in or cutmap.ac.in account can join with this link, shared anywhere.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={`${window.location.origin}/join/${channel.invite_code}`}
                  onFocus={(e) => e.target.select()}
                  className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                />
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(`${window.location.origin}/join/${channel.invite_code}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {isChannelAdmin && (
              <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invite by email</h4>
                <p className="mt-1 text-[11px] text-slate-400">
                  Sends the join link to their campus email instead of sharing it yourself.
                </p>
                <form onSubmit={sendInvite} className="mt-2 flex items-center gap-2">
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="name@cutm.ac.in"
                    className="min-w-0 flex-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
                  />
                  <button
                    type="submit"
                    disabled={invitingByEmail}
                    className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {invitingByEmail ? 'Sending…' : inviteSent ? 'Sent ✓' : 'Send'}
                  </button>
                </form>
              </div>
            )}

            {joinRequests.length > 0 && (
              <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Join requests · {joinRequests.length}
                </h4>
                <ul className="mt-2 space-y-2">
                  {joinRequests.map((r) => (
                    <li key={r.id} className="flex items-center gap-3">
                      <Avatar name={r.userName} size={32} />
                      <p className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{r.userName}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          disabled={busyRequestId === r.id}
                          onClick={() => respondToRequest(r.id, true)}
                          className="text-[11px] font-medium text-blue-600 hover:text-blue-700 disabled:opacity-40"
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
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isChannelAdmin && (
              <div className="mt-6 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Settings</h4>
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
            )}

            <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Members</h4>
                <button
                  onClick={startAdding}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  + Add
                </button>
              </div>

              <ul className="mt-2 space-y-1">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-1.5">
                    <Avatar name={m.name} url={m.avatarUrl} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-700 dark:text-slate-200">
                        {m.name}
                        {isCreator(m.id) && <span className="ml-1.5 text-[10px] text-slate-400">creator</span>}
                      </p>
                      {m.role === 'admin' && <p className="text-[11px] text-blue-500">Admin</p>}
                    </div>
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
                  </li>
                ))}
              </ul>

              {adding && (
                <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  {candidates.length === 0 && (
                    <p className="p-3 text-xs text-slate-400">No one else to add.</p>
                  )}
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      disabled={busyUserId === c.id}
                      onClick={() => addMember(c.id)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-40 dark:hover:bg-slate-800"
                    >
                      <Avatar name={c.name} url={c.avatarUrl} size={28} />
                      <span className="truncate text-sm text-slate-700 dark:text-slate-200">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
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
