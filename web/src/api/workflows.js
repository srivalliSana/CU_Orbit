import { api } from './auth';

export const getWorkflows = (channelId) => api(`/api/channels/${encodeURIComponent(channelId)}/workflows`);

export const createWorkflow = (channelId, data) =>
  api(`/api/channels/${encodeURIComponent(channelId)}/workflows`, { method: 'POST', body: JSON.stringify(data) });

export const updateWorkflow = (id, data) =>
  api(`/api/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteWorkflow = (id) => api(`/api/workflows/${id}`, { method: 'DELETE' });
