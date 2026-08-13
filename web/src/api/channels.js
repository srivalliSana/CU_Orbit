import { api } from './auth';

export const getChannel = (id) => api(`/api/channels/${id}`);

export const getChannelMembers = (id) => api(`/api/channels/${id}/members`);

export const addChannelMember = (id, userId, role) =>
  api(`/api/channels/${id}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId, role }),
  });

export const removeChannelMember = (id, userId) =>
  api(`/api/channels/${id}/members/${userId}`, { method: 'DELETE' });

export const updateChannel = (id, patch) =>
  api(`/api/channels/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });

export const joinChannelByLink = (inviteCode) =>
  api('/api/channels/join-by-link', {
    method: 'POST',
    body: JSON.stringify({ inviteCode }),
  });
