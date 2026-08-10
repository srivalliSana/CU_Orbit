import { client } from "./client";

export interface MentionItem {
  id: string;
  message_id: string;
  sender_id: string;
  sender_name: string;
  text: string;
  sent_at: number;
  channel_id: string;
  channel_name: string;
  is_read: boolean;
}

// :userId is ignored server-side (same convention as /home/:userId) — "me"
// documents that rather than pretending it's meaningful.
export const getMentions = () =>
  client.get<MentionItem[]>("/mentions/me").then((res) => res.data);

export const markMentionRead = (mentionId: string) =>
  client.post(`/mentions/${mentionId}/read`, {}).catch(() => {});
