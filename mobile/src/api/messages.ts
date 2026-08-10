import { client } from "./client";
import type { Message } from "../types/api";

export const getMessages = (containerId: string) =>
  client
    .get<Message[]>(`/messages/${encodeURIComponent(containerId)}`)
    .then((res) => res.data);

export const sendMessage = (params: {
  containerId: string;
  body: string;
  type?: string;
  mediaUrl?: string;
}) =>
  client
    .post<Message>("/messages", {
      channelId: params.containerId,
      body: params.body,
      type: params.type ?? "text",
      mediaUrl: params.mediaUrl,
    })
    .then((res) => res.data);

export const setTyping = (channelId: string) =>
  client
    .post(`/channels/${encodeURIComponent(channelId)}/typing`, {})
    .catch(() => {}); // typing is best-effort; never surface a failure

export const markConversationRead = (containerId: string) =>
  client
    .post(`/conversations/${encodeURIComponent(containerId)}/read`, {})
    .catch(() => {}); // best-effort; never block the UI

export const reactToMessage = (messageId: string, emoji: string) =>
  client.post<Message>(`/messages/${messageId}/reactions`, { emoji }).then((res) => res.data);

export const deleteMessage = (messageId: string) =>
  client.delete(`/messages/${messageId}`).then((res) => res.data);
