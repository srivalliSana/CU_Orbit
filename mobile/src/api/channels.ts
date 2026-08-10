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
