// Timestamps arrive as epoch milliseconds (Message.timestamp is a BIGINT).
const asDate = (t) => new Date(Number(t));

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const clockLabel = (t) =>
  asDate(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Chat-list stamp: time today, "Yesterday", weekday this week, else a date. */
export function timeLabel(t) {
  const d = asDate(t);
  const now = new Date();
  if (sameDay(d, now)) return clockLabel(t);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';

  if (now - d < 7 * 864e5) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Divider label between days in a conversation. */
export function dayLabel(t) {
  const d = asDate(t);
  const now = new Date();
  if (sameDay(d, now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';

  return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Deterministic colour per name, so an avatar keeps its colour between loads. */
export function colorFor(name = '') {
  const palette = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#c026d3', '#4f46e5'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
