import { api } from './auth';

export const getThreads = () => api('/api/threads');

export const getThread = (parentId) => api(`/api/threads/${encodeURIComponent(parentId)}`);

export const markThreadRead = (parentId) =>
  api(`/api/threads/${encodeURIComponent(parentId)}/read`, { method: 'POST', body: '{}' }).catch(() => {});
