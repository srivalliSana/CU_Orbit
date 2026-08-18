export interface User {
  id: string;
  name: string;
  email?: string;
  campusEmail?: string;
  campus_email?: string;
  role: string;
  avatarUrl?: string | null;
  handle?: string;
  bio?: string;
  status_emoji?: string;
  status_text?: string;
  is_active?: boolean;
}

export interface MessagePreview {
  sender_id: string;
  sender_name: string;
  text: string;
  sent_at: number;
  type: string;
  sender_is_self: boolean;
}

export interface ChannelSummary {
  id: string;
  name: string;
  workspace_id: string;
  is_member: boolean;
  is_muted: boolean;
  is_pinned: boolean;
  last_message_preview: MessagePreview | null;
  unread_count: number;
  has_unread_mention: boolean;
}

export interface DmSummary {
  id: string;
  other_user_id: string;
  other_user_name: string;
  other_user_avatar_url: string | null;
  presence: string;
  is_pinned: boolean;
  is_muted: boolean;
  unread_count: number;
  has_unread_mention: boolean;
  last_message_preview: MessagePreview | null;
}

export interface HomeFeed {
  channels: ChannelSummary[];
  dms: DmSummary[];
}

export interface EnrichedMention {
  user_id: string;
  display_name: string;
  phone: string;
}

export interface Reaction {
  userId: string;
  userName: string;
  emoji: string;
}

export interface Message {
  id: string;
  channel_id: string | null;
  dm_id: string | null;
  sender_id: string;
  sender_name: string;
  sender_avatar_url: string | null;
  text: string;
  sent_at: number;
  type: string;
  attachments: Array<{ type: string; url: string; name?: string; mimeType?: string }>;
  reactions: Reaction[];
  status: string;
  is_pinned?: boolean;
  is_starred?: boolean;
  edited_at?: string | null;
  reply_to?: { id: string; sender_name: string; text: string } | null;
  forwarded_from?: { sender_name: string } | null;
  poll?: {
    id: string;
    channel_id: string;
    question: string;
    options: string[];
    multiple_choice: boolean;
    closed: boolean;
    total_votes: number;
    counts: number[];
    voters: { id: string; name: string; avatarUrl: string | null }[][];
    my_votes: number[];
    voted_members: number;
    total_members: number;
  } | null;
  enriched_mentions: EnrichedMention[];
}
