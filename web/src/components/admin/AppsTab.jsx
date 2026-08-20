import React, { useEffect, useState } from 'react';
import {
  createApp, createSlashCommand, deleteSlashCommand, getAppInstallations, getApps,
  getSlashCommands, revokeInstallation, setAppStatus,
} from '../../api/admin';

const SCOPE_OPTIONS = [
  { id: 'commands', label: 'Slash commands' },
  { id: 'chat:write', label: 'Post messages (as its bot)' },
  { id: 'channels:read', label: 'Read channel/member lists' },
];

/** Superadmin management of installable OAuth apps: register, suspend, revoke
 *  installations, and manage each app's slash commands. Replaces the
 *  register-test-app.js script as the real way to add an app. */
export default function AppsTab() {
  const [apps, setApps] = useState(null);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newSecret, setNewSecret] = useState(null); // { app, client_secret } — shown once
  const [expandedId, setExpandedId] = useState(null);

  const load = () => getApps().then(setApps).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Installable apps — OAuth-authenticated bots that can post messages and register slash commands.
        </p>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          {showCreate ? 'Cancel' : '+ Register app'}
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      {showCreate && (
        <CreateAppForm
          onCreated={(result) => { setNewSecret(result); setShowCreate(false); load(); }}
        />
      )}

      {newSecret && <NewSecretModal result={newSecret} onClose={() => setNewSecret(null)} />}

      {!apps ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : apps.length === 0 ? (
        <p className="text-xs text-slate-400">No apps registered yet.</p>
      ) : (
        <div className="space-y-2">
          {apps.map((app) => (
            <AppRow
              key={app.id}
              app={app}
              expanded={expandedId === app.id}
              onToggle={() => setExpandedId((id) => (id === app.id ? null : app.id))}
              onStatusChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateAppForm({ onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [redirectUris, setRedirectUris] = useState('');
  const [scopes, setScopes] = useState(['commands', 'chat:write']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const toggleScope = (id) =>
    setScopes((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const uris = redirectUris.split('\n').map((s) => s.trim()).filter(Boolean);
      const result = await createApp({ name, description, icon_url: iconUrl, redirect_uris: uris, scopes });
      onCreated(result);
      setName(''); setDescription(''); setIconUrl(''); setRedirectUris(''); setScopes(['commands', 'chat:write']);
    } catch (e) {
      setError(e.message || 'Could not register the app.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-4 space-y-2.5 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div>
        <label className="text-[11px] font-medium text-slate-500">Name</label>
        <input
          required value={name} onChange={(e) => setName(e.target.value)}
          placeholder="DesignHub"
          className="mt-0.5 w-full rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
        />
      </div>
      <div>
        <label className="text-[11px] font-medium text-slate-500">Description (optional)</label>
        <input
          value={description} onChange={(e) => setDescription(e.target.value)}
          className="mt-0.5 w-full rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
        />
      </div>
      <div>
        <label className="text-[11px] font-medium text-slate-500">Icon URL (optional)</label>
        <input
          value={iconUrl} onChange={(e) => setIconUrl(e.target.value)}
          className="mt-0.5 w-full rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
        />
      </div>
      <div>
        <label className="text-[11px] font-medium text-slate-500">Redirect URIs (one per line — where CU Orbit sends the OAuth code back)</label>
        <textarea
          required rows={2} value={redirectUris} onChange={(e) => setRedirectUris(e.target.value)}
          placeholder="https://designhub.example.com/oauth/callback"
          className="mt-0.5 w-full rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
        />
      </div>
      <div>
        <label className="text-[11px] font-medium text-slate-500">Scopes</label>
        <div className="mt-1 flex flex-wrap gap-3">
          {SCOPE_OPTIONS.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={scopes.includes(s.id)} onChange={() => toggleScope(s.id)} />
              {s.label}
            </label>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit" disabled={busy}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? 'Registering…' : 'Register app'}
      </button>
    </form>
  );
}

function NewSecretModal({ result, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(result.client_secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{result.app.name} registered</h3>
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          The client secret is shown once. Copy it now — it can't be retrieved again after you close this.
        </p>
        <div className="mt-3 space-y-2">
          <div>
            <label className="text-[11px] font-medium text-slate-500">Client ID</label>
            <input readOnly value={result.app.client_id} onFocus={(e) => e.target.select()} className="mt-0.5 w-full rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500">Client secret</label>
            <div className="mt-0.5 flex items-center gap-2">
              <input readOnly value={result.client_secret} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200" />
              <button onClick={copy} className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
          Done
        </button>
      </div>
    </div>
  );
}

function AppRow({ app, expanded, onToggle, onStatusChanged }) {
  const [busy, setBusy] = useState(false);

  const toggleStatus = async () => {
    setBusy(true);
    try {
      await setAppStatus(app.id, app.status === 'approved' ? 'suspended' : 'approved');
      onStatusChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2 p-3">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            app.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
          }`}>
            {app.status}
          </span>
          <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{app.name}</span>
          <span className="truncate font-mono text-[11px] text-slate-400">{app.client_id}</span>
        </button>
        <button
          onClick={toggleStatus} disabled={busy}
          className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium disabled:opacity-50 ${
            app.status === 'approved' ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40'
          }`}
        >
          {app.status === 'approved' ? 'Suspend' : 'Reactivate'}
        </button>
      </div>
      {expanded && (
        <div className="space-y-4 border-t border-slate-200 p-3 dark:border-slate-800">
          {app.description && <p className="text-xs text-slate-500">{app.description}</p>}
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-500">Scopes</p>
            <p className="font-mono text-xs text-slate-600 dark:text-slate-300">{(app.scopes || []).join(', ') || '—'}</p>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-500">Redirect URIs</p>
            {(app.redirect_uris || []).map((u) => (
              <p key={u} className="truncate font-mono text-xs text-slate-600 dark:text-slate-300">{u}</p>
            ))}
          </div>
          <InstallationsSection appId={app.id} />
          <SlashCommandsSection appId={app.id} />
        </div>
      )}
    </div>
  );
}

function InstallationsSection({ appId }) {
  const [installations, setInstallations] = useState(null);
  const load = () => getAppInstallations(appId).then(setInstallations).catch(() => setInstallations([]));
  useEffect(() => { load(); }, [appId]);

  const revoke = async (id) => {
    await revokeInstallation(appId, id);
    load();
  };

  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-slate-500">Installations</p>
      {!installations ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : installations.length === 0 ? (
        <p className="text-xs text-slate-400">Not installed yet.</p>
      ) : (
        <div className="space-y-1.5">
          {installations.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800">
              <span className="truncate text-xs text-slate-600 dark:text-slate-300">
                {i.bot_user?.name || 'unknown bot'} · {i.status}
              </span>
              {i.status === 'active' && (
                <button onClick={() => revoke(i.id)} className="shrink-0 text-[11px] font-medium text-red-600 hover:text-red-700">
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SlashCommandsSection({ appId }) {
  const [commands, setCommands] = useState(null);
  const [command, setCommand] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = () => getSlashCommands(appId).then(setCommands).catch(() => setCommands([]));
  useEffect(() => { load(); }, [appId]);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createSlashCommand(appId, { command, webhook_url: webhookUrl });
      setCommand(''); setWebhookUrl('');
      load();
    } catch (e) {
      setError(e.message || 'Could not add that command.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    await deleteSlashCommand(id);
    load();
  };

  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-slate-500">Slash commands</p>
      {commands?.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {commands.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800">
              <span className="truncate font-mono text-xs text-slate-600 dark:text-slate-300">/{c.command} → {c.webhook_url}</span>
              <button onClick={() => remove(c.id)} className="shrink-0 text-[11px] font-medium text-red-600 hover:text-red-700">Remove</button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={add} className="flex items-center gap-1.5">
        <input
          value={command} onChange={(e) => setCommand(e.target.value)} placeholder="command"
          className="w-24 rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
        />
        <input
          value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://.../webhook"
          className="min-w-0 flex-1 rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
        />
        <button type="submit" disabled={busy} className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Add
        </button>
      </form>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
