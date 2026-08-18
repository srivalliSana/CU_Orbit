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
  mediaName?: string;
  mediaMimeType?: string;
  enrichedMentions?: { user_id: string; display_name: string }[];
  replyToId?: string;
  forwardedFromName?: string;
}) =>
  client
    .post<Message>("/messages", {
      channelId: params.containerId,
      body: params.body,
      type: params.type ?? "text",
      mediaUrl: params.mediaUrl,
      mediaName: params.mediaName,
      mediaMimeType: params.mediaMimeType,
      enrichedMentions: params.enrichedMentions,
      replyToId: params.replyToId,
      forwardedFromName: params.forwardedFromName,
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

export const hideMessage = (messageId: string) =>
  client.post(`/messages/${messageId}/hide`, {}).then((res) => res.data);

export const editMessage = (messageId: string, body: string) =>
  client.put<Message>(`/messages/${messageId}`, { body }).then((res) => res.data);

export const setMessagePinned = (messageId: string, pinned: boolean) =>
  client.put<Message>(`/messages/${messageId}`, { pinned }).then((res) => res.data);

export const starMessage = (messageId: string) =>
  client.post(`/messages/${messageId}/star`, {}).then((res) => res.data);

export const unstarMessage = (messageId: string) =>
  client.delete(`/messages/${messageId}/star`).then((res) => res.data);

export interface StarredMessage {
  id: string;
  container_id: string;
  sender_id: string;
  sender_name: string;
  text: string;
  type: string;
  attachments: { url: string; name?: string; mimeType?: string }[];
  sent_at: number;
}

export const getStarredMessages = (containerId?: string) =>
  client
    .get<StarredMessage[]>(`/starred${containerId ? `?container_id=${encodeURIComponent(containerId)}` : ""}`)
    .then((res) => res.data);

export const getPinnedMessages = (containerId: string) =>
  client.get<StarredMessage[]>(`/containers/${encodeURIComponent(containerId)}/pinned`).then((res) => res.data);

export const getSharedMedia = (containerId: string, type: string) =>
  client
    .get<(StarredMessage & { links?: string[] })[]>(
      `/containers/${encodeURIComponent(containerId)}/media?type=${encodeURIComponent(type)}`
    )
    .then((res) => res.data);

export interface PollSummary {
  id: string;
  channel_id: string;
  question: string;
  options: string[];
  multiple_choice: boolean;
  closed: boolean;
  total_votes: number;
  counts: number[];
  my_votes: number[];
}

export const createPoll = (
  channelId: string,
  params: { question: string; options: string[]; multipleChoice?: boolean }
) =>
  client
    .post<{ message: Message; poll: PollSummary }>(`/channels/${channelId}/polls`, {
      question: params.question,
      options: params.options,
      multipleChoice: params.multipleChoice,
    })
    .then((res) => res.data);

export const votePoll = (pollId: string, optionIndex: number) =>
  client.post<PollSummary>(`/polls/${pollId}/vote`, { optionIndex }).then((res) => res.data);
