import { api } from './auth';

// The :phone path segment is ignored server-side (you may only edit your own
// profile) — kept as 'me' to document that rather than pretend it's used.
export const updateProfile = (patch) =>
  api('/api/users/me', { method: 'PUT', body: JSON.stringify(patch) }).then((d) => d.user);

// Any signed-in user may look up any other by id — this is how clicking a
// name on a message opens their profile card, unrelated to the CampusOne
// directory search (which stays faculty-only).
export const getUser = (id) => api(`/api/users/${encodeURIComponent(id)}`);
