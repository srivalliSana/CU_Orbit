import React, { useEffect, useState } from 'react';
import Avatar from './Avatar';
import SharedMediaPanel from './SharedMediaPanel';
import { getPerson, getPinnedMessages, getStarredMessages, startDm } from '../api/chat';
import { blockUser, reportUser, unblockUser } from '../api/users';
import { lastSeenLabel } from '../lib/format';

/**
 * Contact details, shown when a person is picked from search or a chat header.
 *
 * Identity fields come from CampusOne, which is authoritative; presence and
 * last seen come from CU Orbit and only exist once someone has used the app.
 *
 * target.containerId is only present when opened from an existing DM's
 * header — that's what backs the shared-media grid, and also means "Send
 * message" is redundant (you're already looking at that conversation).
 */
export default function ContactPanel({ target, onClose, onOpenChat, onJumpToMessage }) {
  const [person, setPerson] = useState(null);
  const [error, setError] = useState(null);
  const [opening, setOpening] = useState(false);
  const [view, setView] = useState('main');   // main | media | pinned | starred
  const [listItems, setListItems] = useState(null);
  const [blockBusy, setBlockBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSent, setReportSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPerson(null);
    setError(null);
    getPerson(target)
      .then((d) => { if (!cancelled) setPerson(d.person); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load this contact.'); });
    return () => { cancelled = true; };
  }, [target?.id, target?.email]);

  useEffect(() => {
    setView('main');
  }, [target?.containerId]);

  useEffect(() => {
    if (view === 'main' || view === 'media' || !target?.containerId) return;
    setListItems(null);
    const fetcher = view === 'pinned' ? getPinnedMessages(target.containerId) : getStarredMessages(target.containerId);
    fetcher.then(setListItems).catch(() => setListItems([]));
  }, [view, target?.containerId]);

  const openChat = async () => {
    if (!person?.email || opening) return;
    setOpening(true);
    try {
      const { dm_id, user } = await startDm(person.email);
      onOpenChat({ id: dm_id, kind: 'dm', title: user.name, presence: user.presence, email: person.email });
    } catch (e) {
      setError(e.message || 'Could not open the conversation.');
      setOpening(false);
    }
  };

  const presence = person ? lastSeenLabel(person.presence, person.last_seen_at) : '';

  const toggleBlock = async () => {
    if (!person?.id) return;
    setBlockBusy(true);
    try {
      await (person.is_blocked_by_me ? unblockUser : blockUser)(person.id);
      setPerson((p) => ({ ...p, is_blocked_by_me: !p.is_blocked_by_me }));
    } catch (e) {
      setError(e.message || 'Could not update block status.');
    } finally {
      setBlockBusy(false);
    }
  };

  const submitReport = async (e) => {
    e.preventDefault();
    if (!person?.id) return;
    try {
      await reportUser(person.id, reportReason.trim());
      setReportSent(true);
      setTimeout(() => { setReportOpen(false); setReportSent(false); setReportReason(''); }, 1500);
    } catch (e) {
      setError(e.message || 'Could not send the report.');
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
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Contact info</h2>
        )}
        <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
      </header>

      {view === 'media' && target?.containerId && (
        <div className="flex-1 overflow-y-auto p-5">
          <SharedMediaPanel containerId={target.containerId} onJumpToMessage={onJumpToMessage} />
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
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {!person && !error && <p className="text-sm text-slate-400">Loading…</p>}

        {person && (
          <>
            <div className="flex flex-col items-center text-center">
              <Avatar name={person.name} url={person.avatarUrl} size={88} />
              <h3 className="mt-3 text-lg font-semibold text-slate-800 dark:text-slate-100">{person.name}</h3>
              {presence && <p className="mt-0.5 text-xs text-slate-500">{presence}</p>}
              {!person.in_orbit && (
                <p className="mt-2 rounded-full bg-amber-50 px-3 py-1 text-[11px] text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  Hasn’t used Let's Connect yet
                </p>
              )}
            </div>

            {target?.containerId && (
              <div className="mt-5 flex justify-center gap-3">
                <QuickAction icon="🖼️" label="Media" onClick={() => setView('media')} />
                <QuickAction icon="📌" label="Pinned" onClick={() => setView('pinned')} />
                <QuickAction icon="⭐" label="Starred" onClick={() => setView('starred')} />
              </div>
            )}

            {!target?.containerId && (
              <button
                onClick={openChat}
                disabled={opening}
                className="mt-6 w-full rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
              >
                {opening ? 'Opening…' : 'Send message'}
              </button>
            )}

            <Section label="About">
              <Card className="p-3.5">
                <dl className="space-y-3">
                  <Field label="Email" value={person.email} />
                  <Field label="Role" value={person.role} capitalize />
                  {person.is_hod && <Field label="Position" value="Head of Department" />}
                  <Field label="Department" value={person.department} />
                  <Field label="School" value={person.school} />
                  <Field label="Registration no." value={person.regno} />
                  <Field label="Cohort" value={person.cohort} />
                  <Field label="Campus" value={person.campus} />
                  <Field label="About" value={person.bio} />
                </dl>
              </Card>
            </Section>

            {person.id && (
              <Section label="Actions">
                <Card>
                  <NavRow
                    icon={person.is_blocked_by_me ? '✅' : '🚫'}
                    label={`${person.is_blocked_by_me ? 'Unblock' : 'Block'} ${person.name}`}
                    onClick={toggleBlock}
                    disabled={blockBusy}
                    danger
                  />
                  <NavRow
                    icon="⚠️"
                    label={`Report ${person.name}`}
                    onClick={() => setReportOpen(true)}
                    danger
                    divider
                  />
                </Card>
              </Section>
            )}
          </>
        )}
      </div>

      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setReportOpen(false)}>
          <form
            onSubmit={submitReport}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
          >
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Report {person?.name}</h3>
            {reportSent ? (
              <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">Thanks — an admin will review this.</p>
            ) : (
              <>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="What happened? (optional)"
                  rows={3}
                  className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
    </aside>
  );
}

function Field({ label, value, capitalize }) {
  if (!value) return null;      // omit rather than render an empty row
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-sm text-slate-700 dark:text-slate-200 ${capitalize ? 'capitalize' : ''}`}>{value}</dd>
    </div>
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

function Section({ label, children }) {
  return (
    <div className="mt-5">
      <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</h4>
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
