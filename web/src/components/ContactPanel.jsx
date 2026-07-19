import React, { useEffect, useState } from 'react';
import Avatar from './Avatar';
import { getPerson, startDm } from '../api/chat';
import { lastSeenLabel } from '../lib/format';

/**
 * Contact details, shown when a person is picked from search or a chat header.
 *
 * Identity fields come from CampusOne, which is authoritative; presence and
 * last seen come from CU Orbit and only exist once someone has used the app.
 */
export default function ContactPanel({ target, onClose, onOpenChat }) {
  const [person, setPerson] = useState(null);
  const [error, setError] = useState(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPerson(null);
    setError(null);
    getPerson(target)
      .then((d) => { if (!cancelled) setPerson(d.person); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load this contact.'); });
    return () => { cancelled = true; };
  }, [target?.id, target?.email]);

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

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Contact info</h2>
        <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
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
                  Hasn’t used CU Orbit yet
                </p>
              )}
            </div>

            <dl className="mt-6 space-y-3">
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

            <button
              onClick={openChat}
              disabled={opening}
              className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {opening ? 'Opening…' : 'Send message'}
            </button>
          </>
        )}
      </div>
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
