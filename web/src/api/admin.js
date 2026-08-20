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

export const getActivitySummary = () => api('/api/admin/activity-summary');

export const getApps = () => api('/api/admin/apps');

export const createApp = (data) => api('/api/admin/apps', { method: 'POST', body: JSON.stringify(data) });

export const setAppStatus = (id, status) =>
  api(`/api/admin/apps/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });

export const getAppInstallations = (id) => api(`/api/admin/apps/${id}/installations`);

export const revokeInstallation = (appId, installationId) =>
  api(`/api/admin/apps/${appId}/installations/${installationId}/revoke`, { method: 'POST' });

export const getSlashCommands = (appId) => api(`/api/admin/apps/${appId}/slash-commands`);

export const createSlashCommand = (appId, data) =>
  api(`/api/admin/apps/${appId}/slash-commands`, { method: 'POST', body: JSON.stringify(data) });

export const deleteSlashCommand = (id) => api(`/api/admin/slash-commands/${id}`, { method: 'DELETE' });

export const getOAuthAuthorizeInfo = (params) => api(`/api/oauth/authorize-info?${new URLSearchParams(params)}`);

export const authorizeOAuthApp = (data) => api('/api/oauth/authorize', { method: 'POST', body: JSON.stringify(data) });
