import { client } from "./client";
import type { User } from "../types/api";

export interface AuditLogEntry {
  id: string;
  actor_name: string;
  action: string;
  target_type: string | null;
  detail: string | null;
  createdAt: string;
}

export interface DeletedMessage {
  id: string;
  container_id: string;
  sender_name: string;
  text: string;
  deleted_at: string;
}

export const getAdminUsers = () => client.get<User[]>("/admin/users").then((res) => res.data);

export const changeUserRole = (id: string, role: string) =>
  client.put(`/admin/users/${id}/role`, { role });

export const setUserActive = (id: string, active: boolean) =>
  client.put(`/admin/users/${id}/active`, { active });

export const removeUser = (id: string) => client.delete(`/admin/users/${id}`);

export const bulkAddUsers = (emails: string[]) =>
  client.post<{ added: unknown[]; skipped: unknown[] }>("/admin/users/bulk-add", { emails }).then((res) => res.data);

export const getAuditLog = () => client.get<AuditLogEntry[]>("/admin/audit-log").then((res) => res.data);

export const getDeletedMessages = () => client.get<DeletedMessage[]>("/admin/deleted-messages").then((res) => res.data);
