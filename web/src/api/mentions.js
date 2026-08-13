import { api } from './auth';

// :userId is ignored server-side (same convention as /home/:userId) — "me"
// documents that rather than pretending it's meaningful.
export const getMentions = () => api('/api/mentions/me');

export const markMentionRead = (mentionId) =>
  api(`/api/mentions/${mentionId}/read`, { method: 'POST', body: '{}' }).catch(() => {});
