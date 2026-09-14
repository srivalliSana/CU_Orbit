import { api } from './auth';

export const getCanvas = (channelId) => api(`/api/channels/${encodeURIComponent(channelId)}/canvas`);

export const createCanvas = (channelId, data) =>
  api(`/api/channels/${encodeURIComponent(channelId)}/canvas`, { method: 'POST', body: JSON.stringify(data || {}) });

export const updateCanvas = (id, data) =>
  api(`/api/canvas/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteCanvas = (id) => api(`/api/canvas/${id}`, { method: 'DELETE' });
