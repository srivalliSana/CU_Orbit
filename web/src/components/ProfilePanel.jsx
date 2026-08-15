import React, { useState } from 'react';
import Avatar from './Avatar';
import { updateProfile } from '../api/users';
import { uploadFile } from '../api/chat';

/** Own-profile view/edit panel, shown from the header avatar. */
export default function ProfilePanel({ user, onClose, onUpdated, onOpenSettings }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [statusText, setStatusText] = useState(user?.status_text || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const startEditing = () => {
    setName(user?.name || '');
    setBio(user?.bio || '');
    setStatusText(user?.status_text || '');
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile({
        name: name.trim(),
        bio: bio.trim(),
        status_text: statusText.trim(),
      });
      onUpdated(updated);
      setEditing(false);
    } catch (e) {
      setError(e.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const changeAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { url } = await uploadFile(file);
      const updated = await updateProfile({ avatarUrl: url });
      onUpdated(updated);
    } catch (err) {
      setError(err.message || 'Could not update your avatar.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Your profile</h2>
        <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex flex-col items-center text-center">
          <label className="group relative cursor-pointer">
            <Avatar name={user?.name} url={user?.avatarUrl} size={88} />
            <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] text-white ring-2 ring-white dark:ring-slate-900">
              {uploading ? '…' : '📷'}
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={changeAvatar} disabled={uploading} />
          </label>

          {!editing ? (
            <>
              <h3 className="mt-3 text-lg font-semibold text-slate-800 dark:text-slate-100">{user?.name}</h3>
              <p className="text-xs text-slate-500">{user?.campus_email || user?.email}</p>
              {user?.status_text && <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{user.status_text}</p>}
              {user?.bio && <p className="mt-1 text-xs text-slate-500">{user.bio}</p>}
              <button
                onClick={startEditing}
                className="mt-4 rounded-full bg-slate-100 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Edit profile
              </button>
            </>
          ) : (
            <div className="mt-4 w-full space-y-3 text-left">
              <Field label="Name" value={name} onChange={setName} placeholder="Your name" />
              <Field label="Status" value={statusText} onChange={setStatusText} placeholder="What's on your mind?" />
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  placeholder="A little about you"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>

        {!editing && (
          <button
            onClick={onOpenSettings}
            className="mt-6 flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800/60"
          >
            <span>Settings</span>
            <span className="text-slate-400">›</span>
          </button>
        )}
      </div>
    </aside>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700 dark:text-slate-100"
      />
    </div>
  );
}
