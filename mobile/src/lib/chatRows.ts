import type { ChannelSummary, DmSummary } from "../types/api";
import type { ChatRowItem } from "../components/ChatListRow";

function previewText(preview: { sender_is_self: boolean; text: string } | null): string {
  if (!preview) return "No messages yet";
  return preview.sender_is_self ? `You: ${preview.text}` : preview.text;
}

export const channelToRow = (c: ChannelSummary): ChatRowItem & { isPinned: boolean } => ({
  id: c.id,
  kind: "channel",
  title: c.name,
  avatarUrl: null,
  previewText: previewText(c.last_message_preview),
  sentAt: c.last_message_preview?.sent_at ?? null,
  unreadCount: c.unread_count,
  hasMention: c.has_unread_mention,
  isPinned: c.is_pinned,
});

export const dmToRow = (d: DmSummary): ChatRowItem & { isPinned: boolean } => ({
  id: d.id,
  kind: "dm",
  title: d.other_user_name,
  avatarUrl: d.other_user_avatar_url,
  previewText: previewText(d.last_message_preview),
  sentAt: d.last_message_preview?.sent_at ?? null,
  unreadCount: d.unread_count,
  hasMention: d.has_unread_mention,
  isPinned: d.is_pinned,
  presence: d.presence,
});
