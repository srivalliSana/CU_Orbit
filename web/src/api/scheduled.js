import { api } from './auth';

export const createScheduledMessage = ({ containerId, body, type = 'text', mediaUrl, mediaName, mediaMimeType, enrichedMentions, replyToId, sendAt }) =>
  api('/api/scheduled-messages', {
    method: 'POST',
    body: JSON.stringify({ channelId: containerId, body, type, mediaUrl, mediaName, mediaMimeType, enrichedMentions, replyToId, sendAt }),
  });

export const getScheduledMessages = (containerId) =>
  api(`/api/scheduled-messages${containerId ? `?container_id=${encodeURIComponent(containerId)}` : ''}`);

export const cancelScheduledMessage = (id) =>
  api(`/api/scheduled-messages/${id}`, { method: 'DELETE' });
