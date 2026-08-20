import React, { useEffect, useState } from 'react';
import Avatar from './Avatar';
import {
  bulkAddUsers, changeUserRole, getActivitySummary, getAdminUsers, getAuditLog, getDeletedMessages,
  getSecurityEvents, getSystemHealth, promoteByEmail, removeUser, setUserActive,
} from '../api/admin';
import { timeLabel } from '../lib/format';
import AppsTab from './admin/AppsTab';

const ROLES = ['student', 'faculty', 'admin', 'examcell', 'coordinator'];
const TABS = [
  { id: 'members', label: 'Members' },
  { id: 'activity', label: 'Activity monitor' },
  { id: 'security', label: 'Security monitor' },
  { id: 'apps', label: 'Apps' },
  { id: 'audit', label: 'Audit log' },
  { id: 'deleted', label: 'Deleted messages' },
];

/** Superadmin-only workspace administration: members/roles, audit trail, deleted-message review. */
export default function AdminPanel({ currentUser, onClose }) {
  const [tab, setTab] = useState('members');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex h-full max-h-[720px] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Admin</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
        </header>

        <div className="flex gap-1 border-b border-slate-200 px-5 pt-3 dark:border-slate-800">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-t-lg px-3 py-2 text-xs font-medium ${
                tab === t.id
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'members' && <MembersTab currentUser={currentUser} />}
          {tab === 'activity' && <ActivityTab />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'apps' && <AppsTab />}
          {tab === 'audit' && <AuditTab />}
          {tab === 'deleted' && <DeletedTab />}
        </div>
      </div>
    </div>
  );
}

function MembersTab({ currentUser }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [bulkEmails, setBulkEmails] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [promoteEmail, setPromoteEmail] = useState('');
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [promoteDone, setPromoteDone] = useState(false);

  const load = () => getAdminUsers().then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const onRoleChange = async (id, role) => {
    try { await changeUserRole(id, role); load(); } catch (e) { setError(e.message); }
  };

  const onToggleActive = async (u) => {
    try { await setUserActive(u.id, !u.is_active); load(); } catch (e) { setError(e.message); }
  };

  const onRemove = async (u) => {
    if (!confirm(`Remove ${u.name} from the workspace? They'll be dropped from every channel.`)) return;
    try { await removeUser(u.id); load(); } catch (e) { setError(e.message); }
  };

  const onBulkAdd = async (e) => {
    e.preventDefault();
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const emails = bulkEmails.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      const result = await bulkAddUsers(emails);
      setBulkResult(result);
      setBulkEmails('');
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBulkBusy(false);
    }
  };

  const onPromote = async (e) => {
    e.preventDefault();
    setPromoteBusy(true);
    setError(null);
    try {
      await promoteByEmail(promoteEmail.trim().toLowerCase());
      setPromoteEmail('');
      setPromoteDone(true);
      setTimeout(() => setPromoteDone(false), 2500);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setPromoteBusy(false);
    }
  };

  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!users) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <form onSubmit={onPromote} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Make superadmin by email</label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="email"
            required
            value={promoteEmail}
            onChange={(e) => setPromoteEmail(e.target.value)}
            placeholder="name@cutm.ac.in"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={promoteBusy || !promoteEmail.trim()}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {promoteBusy ? 'Promoting…' : promoteDone ? 'Done ✓' : 'Promote'}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Creates the account if they haven't signed in yet, then gives them full superadmin access.
        </p>
      </form>

      <form onSubmit={onBulkAdd} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Bulk add by campus email</label>
        <textarea
          value={bulkEmails}
          onChange={(e) => setBulkEmails(e.target.value)}
          placeholder="one@cutm.ac.in, two@cutmap.ac.in ..."
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700 dark:text-slate-100"
        />
        <div className="mt-2 flex items-center justify-between">
          <button
            type="submit"
            disabled={bulkBusy || !bulkEmails.trim()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {bulkBusy ? 'Adding…' : 'Add'}
          </button>
          {bulkResult && (
            <span className="text-xs text-slate-500">
              {bulkResult.added.length} added, {bulkResult.skipped.length} skipped
            </span>
          )}
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-2">Member</th>
              <th className="pb-2">Role</th>
              <th className="pb-2">Status</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={u.name} url={u.avatarUrl} size={28} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800 dark:text-slate-100">{u.name}</p>
                      <p className="truncate text-xs text-slate-400">{u.campus_email || u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <select
                    value={u.role}
                    onChange={(e) => onRoleChange(u.id, e.target.value)}
                    disabled={u.id === currentUser?.id}
                    className="rounded border border-slate-200 bg-transparent px-2 py-1 text-xs dark:border-slate-700"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-3">
                  {u.is_active === false
                    ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">Deactivated</span>
                    : <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700 dark:bg-green-950 dark:text-green-300">Active</span>}
                </td>
                <td className="py-2 text-right">
                  {u.id !== currentUser?.id && (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => onToggleActive(u)} className="text-xs text-slate-500 hover:text-slate-700">
                        {u.is_active === false ? 'Reactivate' : 'Deactivate'}
                      </button>
                      <button onClick={() => onRemove(u)} className="text-xs text-red-600 hover:text-red-700">Remove</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const formatGB = (bytes) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
const formatUptime = (seconds) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

function HealthBar({ label, percent, detail }) {
  const color = percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{percent}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      {detail && <p className="mt-1 text-[11px] text-slate-400">{detail}</p>}
    </div>
  );
}

function StatTile({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3 text-center dark:border-slate-800">
      <p className="text-xl font-semibold text-slate-800 dark:text-slate-100">{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}

/** Server health (CPU/memory/disk/uptime) + a live activity snapshot — polls every 8s while open. */
function ActivityTab() {
  const [health, setHealth] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      Promise.all([getSystemHealth(), getActivitySummary()])
        .then(([h, s]) => { if (!cancelled) { setHealth(h); setSummary(s); } })
        .catch((e) => { if (!cancelled) setError(e.message); });
    };
    load();
    const interval = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!health || !summary) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Server health</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <HealthBar label="CPU" percent={health.cpu.usagePercent} detail={`load ${health.cpu.load1.toFixed(2)} / ${health.cpu.cores} cores`} />
          <HealthBar label="Memory" percent={health.memory.usagePercent} detail={`${formatGB(health.memory.usedBytes)} / ${formatGB(health.memory.totalBytes)}`} />
          {health.disk ? (
            <HealthBar label="Disk" percent={health.disk.usagePercent} detail={`${formatGB(health.disk.usedBytes)} / ${formatGB(health.disk.totalBytes)}`} />
          ) : (
            <div className="rounded-lg border border-slate-100 p-3 text-xs text-slate-400 dark:border-slate-800">Disk usage unavailable</div>
          )}
          <div className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Server uptime</p>
            <p className="mt-1.5 text-lg font-semibold text-slate-800 dark:text-slate-100">{formatUptime(health.systemUptimeSeconds)}</p>
            <p className="text-[11px] text-slate-400">process up {formatUptime(health.processUptimeSeconds)}</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Right now</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Online now" value={summary.onlineUsers} />
          <StatTile label="Total members" value={summary.totalUsers} />
          <StatTile label="Messages (24h)" value={summary.messagesToday} />
          <StatTile label="Active channels" value={`${summary.activeChannels}/${summary.totalChannels}`} />
        </div>
      </div>
    </div>
  );
}

const SECURITY_EVENT_LABELS = {
  invalid_google_token: 'Invalid Google token',
  non_campus_login_attempt: 'Non-campus login attempt',
  invalid_otp: 'Wrong OTP code',
  otp_lockout: 'OTP lockout (too many wrong tries)',
  invalid_release_token: 'Invalid release-registration token',
};

/** Security monitor — failed logins, invalid tokens, lockouts, each with an offline geo-IP location. */
function SecurityTab() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { getSecurityEvents().then(setEvents).catch((e) => setError(e.message)); }, []);

  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!events) return <p className="text-sm text-slate-400">Loading…</p>;
  if (events.length === 0) return <p className="text-sm text-slate-400">No suspicious activity logged.</p>;

  return (
    <ul className="space-y-2">
      {events.map((e) => (
        <li key={e.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium text-red-600 dark:text-red-400">{SECURITY_EVENT_LABELS[e.type] || e.type}</span>
            <span className="shrink-0 text-xs text-slate-400">{timeLabel(e.createdAt)}</span>
          </div>
          <p className="text-xs text-slate-500">
            {e.ip || 'unknown IP'}{e.location ? ` — ${e.location}` : ''}{e.detail ? ` — ${e.detail}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

function AuditTab() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { getAuditLog().then(setEntries).catch((e) => setError(e.message)); }, []);

  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!entries) return <p className="text-sm text-slate-400">Loading…</p>;
  if (entries.length === 0) return <p className="text-sm text-slate-400">No admin actions logged yet.</p>;

  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <li key={e.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium text-slate-800 dark:text-slate-100">{e.action}</span>
            <span className="shrink-0 text-xs text-slate-400">{timeLabel(e.createdAt)}</span>
          </div>
          <p className="text-xs text-slate-500">
            {e.actor_name} {e.target_type ? `→ ${e.target_type}` : ''} {e.detail ? `— ${e.detail}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

function DeletedTab() {
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { getDeletedMessages().then(setMessages).catch((e) => setError(e.message)); }, []);

  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!messages) return <p className="text-sm text-slate-400">Loading…</p>;
  if (messages.length === 0) return <p className="text-sm text-slate-400">No deleted messages.</p>;

  return (
    <ul className="space-y-2">
      {messages.map((m) => (
        <li key={m.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium text-slate-800 dark:text-slate-100">{m.sender_name}</span>
            <span className="shrink-0 text-xs text-slate-400">deleted {timeLabel(m.deleted_at)}</span>
          </div>
          <p className="text-slate-600 dark:text-slate-300">{m.text}</p>
        </li>
      ))}
    </ul>
  );
}
