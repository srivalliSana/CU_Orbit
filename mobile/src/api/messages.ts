import { client } from "./client";
import type { Message } from "../types/api";

export const getMessages = (containerId: string, before?: number) =>
  client
    .get<Message[]>(`/messages/${encodeURIComponent(containerId)}${before ? `?before=${before}` : ""}`)
    .then((res) => res.data);

export interface MessageReads {
  read_count: number;
  audience: number;
  readers: { id: string; name: string; avatarUrl: string | null; read_at: string }[];
}

/** "Seen by" for a group message — mirrors web's getReads. */
export const getReads = (messageId: string) =>
  client.get<MessageReads>(`/messages/${messageId}/reads`).then((res) => res.data);

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

export interface PollVoter {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface PollSummary {
  id: string;
  channel_id: string;
  question: string;
  options: string[];
  multiple_choice: boolean;
  closed: boolean;
  total_votes: number;
  counts: number[];
  voters?: PollVoter[][];
  my_votes: number[];
  voted_members?: number;
  total_members?: number;
  // Channel Quiz fields — all null/false for an ordinary poll.
  quiz_mode: boolean;
  option_images: (string | null)[] | null;
  correct_option_index: number | null;   // withheld until my_votes is non-empty, or for the creator/an admin
  my_correct: boolean | null;
  correct_count: number | null;          // admin-only engagement metric
}

export const createPoll = (
  channelId: string,
  params: {
    question: string;
    options: string[];
    multipleChoice?: boolean;
    quizMode?: boolean;
    correctOptionIndex?: number;
    optionImages?: (string | null)[];
  }
) =>
  client
    .post<{ message: Message; poll: PollSummary }>(`/channels/${channelId}/polls`, {
      question: params.question,
      options: params.options,
      multipleChoice: params.multipleChoice,
      quizMode: params.quizMode,
      correctOptionIndex: params.correctOptionIndex,
      optionImages: params.optionImages,
    })
    .then((res) => res.data);

export const votePoll = (pollId: string, optionIndex: number) =>
  client.post<PollSummary>(`/polls/${pollId}/vote`, { optionIndex }).then((res) => res.data);

export const sendMessageAction = (messageId: string, actionId: string, value?: string) =>
  client
    .post<{ success: boolean; updated: boolean }>(`/messages/${messageId}/actions`, { action_id: actionId, value })
    .then((res) => res.data);

export interface Reminder {
  id: string;
  remind_at: number;
  channel_id: string;
  message_id: string;
  message_text: string | null;
  message_sender_name: string | null;
}

export const remindMessage = (messageId: string, minutesFromNow: number) =>
  client.post<Reminder>(`/messages/${messageId}/remind`, { minutesFromNow }).then((res) => res.data);

export const getReminders = () => client.get<Reminder[]>("/reminders").then((res) => res.data);

export const cancelReminder = (id: string) => client.delete(`/reminders/${id}`).then((res) => res.data);
