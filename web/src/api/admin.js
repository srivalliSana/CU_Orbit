import { api } from './auth';

export const getAdminUsers = () => api('/api/admin/users');

export const changeUserRole = (id, role) =>
  api(`/api/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) });

export const setUserActive = (id, active) =>
  api(`/api/admin/users/${id}/active`, { method: 'PUT', body: JSON.stringify({ active }) });

export const removeUser = (id) =>
  api(`/api/admin/users/${id}`, { method: 'DELETE' });

export const bulkAddUsers = (emails) =>
  api('/api/admin/users/bulk-add', { method: 'POST', body: JSON.stringify({ emails }) });

export const promoteByEmail = (email) =>
  api('/api/admin/users/promote-by-email', { method: 'POST', body: JSON.stringify({ email }) });

export const getAuditLog = () => api('/api/admin/audit-log');

export const getDeletedMessages = () => api('/api/admin/deleted-messages');

export const getMessageHistory = (id) => api(`/api/admin/messages/${id}/history`);

export const deleteChannel = (id) => api(`/api/channels/${id}`, { method: 'DELETE' });

export const setChannelActive = (id, active) =>
  api(`/api/channels/${id}/active`, { method: 'PUT', body: JSON.stringify({ active }) });

export const getSystemHealth = () => api('/api/admin/system-health');

export const getSecurityEvents = () => api('/api/admin/security-events');
