import { client } from "./client";
import { DEFAULT_WORKSPACE_ID } from "../constants/config";
import type { ChannelSummary } from "../types/api";

export const createChannel = (params: {
  name: string;
  description?: string;
  type: "public" | "private";
  members?: string[];
  workspaceId?: string;
}) =>
  client
    .post<ChannelSummary>(`/workspaces/${params.workspaceId ?? DEFAULT_WORKSPACE_ID}/channels`, {
      name: params.name,
      description: params.description ?? "",
      type: params.type,
      members: params.members ?? [],
    })
    .then((res) => res.data);

export interface ChannelDetail {
  id: string;
  name: string;
  topic: string;
  member_count: number;
  created_by: string | null;
  invite_code: string;
  restricted_messaging: boolean;
  info_edit_restricted: boolean;
  approval_required: boolean;
}

export interface ChannelMemberRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: "admin" | "member";
}

export const getChannel = (id: string) =>
  client.get<ChannelDetail>(`/channels/${id}`).then((res) => res.data);

export const getChannelMembers = (id: string) =>
  client.get<ChannelMemberRow[]>(`/channels/${id}/members`).then((res) => res.data);

export const addChannelMember = (id: string, userId: string, role?: "admin" | "member") =>
  client.post(`/channels/${id}/members`, { userId, role });

export const removeChannelMember = (id: string, userId: string) =>
  client.delete(`/channels/${id}/members/${userId}`);

export const updateChannel = (id: string, patch: Partial<ChannelDetail>) =>
  client.put<ChannelDetail>(`/channels/${id}`, patch).then((res) => res.data);

export interface JoinByLinkResult {
  success: boolean;
  pendingApproval?: boolean;
  channel?: { id: string; name: string; topic: string };
}

export const joinChannelByLink = (inviteCode: string) =>
  client.post<JoinByLinkResult>("/channels/join-by-link", { inviteCode }).then((res) => res.data);
