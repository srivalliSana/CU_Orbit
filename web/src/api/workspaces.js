import { api } from './auth';

export const getWorkspaces = () => api('/api/workspaces');
