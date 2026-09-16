import { api } from './auth';

export const getSlashCommands = () => api('/api/slash-commands');
