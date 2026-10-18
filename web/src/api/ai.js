import { api } from './auth';

export const getAiMessages = () => api('/api/ai/messages');

export const sendAiMessage = (text) =>
  api('/api/ai/messages', { method: 'POST', body: JSON.stringify({ text }) });

export const generateAiImage = (prompt) =>
  api('/api/ai/image', { method: 'POST', body: JSON.stringify({ prompt }) });
