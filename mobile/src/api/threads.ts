import { client } from "./client";
import type { Message } from "../types/api";

export interface ThreadSummary {
  parent_message_id: string;
  container_id: string;
  channel_name: string | null;
  is_dm: boolean;
  root_sender_name: string;
  root_text: string;
  root_sent_at: number;
  reply_count: number;
  last_reply: { sender_name: string; text: string; sent_at: number } | null;
  has_unread: boolean;
}

export const getThreads = () => client.get<ThreadSummary[]>("/threads").then((res) => res.data);

export const getThread = (parentId: string) =>
  client.get<{ root: Message; replies: Message[] }>(`/threads/${encodeURIComponent(parentId)}`).then((res) => res.data);

export const markThreadRead = (parentId: string) =>
  client.post(`/threads/${encodeURIComponent(parentId)}/read`, {}).catch(() => {});
