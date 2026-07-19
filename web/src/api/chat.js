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
