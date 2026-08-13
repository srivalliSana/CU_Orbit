import { api } from './auth';

// The :phone path segment is ignored server-side (you may only edit your own
// profile) — kept as 'me' to document that rather than pretend it's used.
export const updateProfile = (patch) =>
  api('/api/users/me', { method: 'PUT', body: JSON.stringify(patch) }).then((d) => d.user);
