import { client } from "./client";

export interface ScheduledMessageRow {
  id: string;
  channel_id: string;
  body: string | null;
  send_at: string;
  status: "pending" | "sent" | "canceled" | "failed";
}

export const createScheduledMessage = (params: {
  containerId: string;
  body?: string;
  type?: string;
  mediaUrl?: string;
  mediaName?: string;
  mediaMimeType?: string;
  enrichedMentions?: unknown;
  replyToId?: string;
  sendAt: string;
}) =>
  client
    .post<ScheduledMessageRow>("/scheduled-messages", {
      channelId: params.containerId,
      body: params.body,
      type: params.type || "text",
      mediaUrl: params.mediaUrl,
      mediaName: params.mediaName,
      mediaMimeType: params.mediaMimeType,
      enrichedMentions: params.enrichedMentions,
      replyToId: params.replyToId,
      sendAt: params.sendAt,
    })
    .then((res) => res.data);

export const getScheduledMessages = (containerId: string) =>
  client.get<ScheduledMessageRow[]>("/scheduled-messages", { params: { container_id: containerId } }).then((res) => res.data);

export const cancelScheduledMessage = (id: string) => client.delete(`/scheduled-messages/${id}`).then((res) => res.data);
