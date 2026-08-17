import React, { useEffect, useState } from 'react';
import Avatar from './Avatar';
import { getUser } from '../api/users';

/**
 * Click a name/avatar on a message to see this — anyone signed into CU Orbit
 * may open anyone else's card and start a DM, whether or not they're
 * faculty; the campus directory (search-all-of-CampusOne) stays a separate,
 * faculty-only feature. Access here is scoped by already knowing the
 * sender's id from a conversation you're both in, not open browsing.
 */
export default function UserProfileModal({ userId, currentUser, onClose, onOpenChat }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setUser(null);
    setError(null);
    getUser(userId).catch((e) => setError(e.message || 'Could not load this profile.')).then((u) => u && setUser(u));
  }, [userId]);

  const isMe = userId === currentUser?.id;

  const sendMessage = () => {
    const dmId = [currentUser.id, userId].sort().join('_');
    onOpenChat?.({ id: dmId, kind: 'dm', title: user.name, email: user.campus_email });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl dark:bg-slate-900"
      >
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {!user && !error && <p className="py-8 text-sm text-slate-400">Loading…</p>}
        {user && (
          <>
            <div className="flex justify-center">
              <Avatar name={user.name} url={user.avatarUrl} size={72} />
            </div>
            <h3 className="mt-3 text-lg font-semibold text-slate-800 dark:text-slate-100">{user.name}</h3>
            {(user.status_emoji || user.status_text) && (
              <p className="mt-0.5 text-sm text-slate-500">{user.status_emoji} {user.status_text}</p>
            )}
            {user.bio && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{user.bio}</p>}
            {user.role && user.role !== 'student' && (
              <p className="mt-1 text-[11px] uppercase tracking-wide text-blue-500">{user.role}</p>
            )}

            {!isMe && (
              <button
                onClick={sendMessage}
                className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Send message
              </button>
            )}
            <button onClick={onClose} className="mt-2 w-full rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
