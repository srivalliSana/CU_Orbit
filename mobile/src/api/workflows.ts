import { client } from "./client";

export type WorkflowTriggerType = "message_contains" | "member_joined" | "schedule";
export type WorkflowActionType = "post_message" | "add_list_item";

export interface WorkflowRow {
  id: string;
  channel_id: string;
  name: string;
  is_active: boolean;
  trigger_type: WorkflowTriggerType;
  trigger_config: { keyword?: string; hour?: number; minute?: number; days?: number[] };
  action_type: WorkflowActionType;
  action_config: { body?: string; list_id?: string };
  created_by: string;
  createdAt: string;
}

export const getWorkflows = (channelId: string) =>
  client.get<WorkflowRow[]>(`/channels/${channelId}/workflows`).then((res) => res.data);

export const createWorkflow = (
  channelId: string,
  data: Pick<WorkflowRow, "name" | "trigger_type" | "trigger_config" | "action_type" | "action_config">
) => client.post<WorkflowRow>(`/channels/${channelId}/workflows`, data).then((res) => res.data);

export const updateWorkflow = (id: string, data: Partial<WorkflowRow>) =>
  client.put<WorkflowRow>(`/workflows/${id}`, data).then((res) => res.data);

export const deleteWorkflow = (id: string) => client.delete(`/workflows/${id}`).then((res) => res.data);
