import { api, getToken } from './auth';

// The server derives the acting user from the session, so the :userId segment
// is ignored — 'me' documents that rather than pretending it is meaningful.
export const getHome = (workspaceId = 'default') =>
  api(`/api/home/me/${workspaceId}`);

export const getMessages = (containerId) =>
  api(`/api/messages/${encodeURIComponent(containerId)}`);

export const sendMessage = ({ containerId, body, type = 'text', mediaUrl }) =>
  api('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ channelId: containerId, body, type, mediaUrl }),
  });

export const setTyping = (channelId) =>
  api(`/api/channels/${encodeURIComponent(channelId)}/typing`, { method: 'POST', body: '{}' })
    .catch(() => {});   // typing is best-effort; never surface a failure

export const getTyping = (channelId) =>
  api(`/api/channels/${encodeURIComponent(channelId)}/typing`).catch(() => []);

export const markRead = (messageId) =>
  api(`/api/messages/${messageId}`, { method: 'PUT', body: JSON.stringify({ status: 'read' }) })
    .catch(() => {});

export async function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  // Deliberately not using api(): FormData must set its own multipart boundary.
  const token = getToken();
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export const listUsers = () => api('/api/users');

export const createGroup = ({ name, description, type, members }) =>
  api('/api/workspaces/default/channels', {
    method: 'POST',
    body: JSON.stringify({ name, description, type, members }),
  });

// --- People (CampusOne directory is authoritative) ---

export const searchDirectory = (q) =>
  api(`/api/directory/search?q=${encodeURIComponent(q || '')}`);

export const getPerson = ({ id, email }) =>
  api(`/api/directory/person?${id ? `id=${encodeURIComponent(id)}` : `email=${encodeURIComponent(email)}`}`);

/** Opens a DM, creating their account from the directory if this is the first. */
export const startDm = (email) =>
  api('/api/directory/dm', { method: 'POST', body: JSON.stringify({ email }) });

// --- Read state ---

export const markConversationRead = (containerId) =>
  api(`/api/conversations/${encodeURIComponent(containerId)}/read`, { method: 'POST', body: '{}' })
    .catch(() => {});   // best-effort; never block the UI

export const getReads = (messageId) => api(`/api/messages/${messageId}/reads`);

export const getUnread = () => api('/api/unread').catch(() => ({ total: 0 }));
