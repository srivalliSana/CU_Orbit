import React, { useEffect, useState } from 'react';
import Avatar from './Avatar';
import { blockUser, getUser, reportUser, unblockUser } from '../api/users';

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
  const [blockBusy, setBlockBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSent, setReportSent] = useState(false);

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

  const toggleBlock = async () => {
    setBlockBusy(true);
    try {
      await (user.is_blocked_by_me ? unblockUser : blockUser)(userId);
      setUser((u) => ({ ...u, is_blocked_by_me: !u.is_blocked_by_me }));
    } catch (e) {
      setError(e.message || 'Could not update block status.');
    } finally {
      setBlockBusy(false);
    }
  };

  const submitReport = async (e) => {
    e.preventDefault();
    try {
      await reportUser(userId, reportReason.trim());
      setReportSent(true);
      setTimeout(() => { setReportOpen(false); setReportSent(false); setReportReason(''); }, 1500);
    } catch (e) {
      setError(e.message || 'Could not send the report.');
    }
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
            {!isMe && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={toggleBlock}
                  disabled={blockBusy}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/40"
                >
                  {user.is_blocked_by_me ? 'Unblock' : 'Block'}
                </button>
                <button
                  onClick={() => setReportOpen(true)}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  Report
                </button>
              </div>
            )}
            <button onClick={onClose} className="mt-2 w-full rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              Close
            </button>
          </>
        )}
      </div>

      {reportOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { e.stopPropagation(); setReportOpen(false); }}>
          <form
            onSubmit={submitReport}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
          >
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Report {user?.name}</h3>
            {reportSent ? (
              <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">Thanks — an admin will review this.</p>
            ) : (
              <>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="What happened? (optional)"
                  rows={3}
                  className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setReportOpen(false)} className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                    Cancel
                  </button>
                  <button type="submit" className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">
                    Send report
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
