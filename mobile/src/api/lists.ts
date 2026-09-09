import { client } from "./client";

export type ListFieldType =
  | "text" | "long_text" | "select" | "status" | "priority" | "date" | "assignee" | "checkbox" | "number";

export interface ListFieldOption {
  id: string;
  label: string;
  color: string;
}

export interface ListSummary {
  id: string;
  channel_id: string;
  name: string;
  icon: string;
  created_by: string;
  item_count: number;
  createdAt: string;
}

export interface ListField {
  id: string;
  list_id: string;
  name: string;
  type: ListFieldType;
  options: ListFieldOption[];
  position: number;
  is_title_field: boolean;
}

export interface ListItemRow {
  id: string;
  list_id: string;
  values: Record<string, string | number | boolean | undefined>;
  position: number;
  created_by: string;
  parent_item_id: string | null;
  comment_count?: number;
}

export interface ListItemComment {
  id: number;
  list_item_id: string;
  user_id: string;
  user_name: string;
  user_avatar_url: string | null;
  body: string;
  createdAt: string;
}

export interface ListDetail {
  list: ListSummary;
  fields: ListField[];
  items: ListItemRow[];
}

export const getLists = (channelId: string) =>
  client.get<ListSummary[]>(`/channels/${encodeURIComponent(channelId)}/lists`).then((res) => res.data);

export const createList = (channelId: string, data: { name: string; icon?: string }) =>
  client.post<ListSummary>(`/channels/${encodeURIComponent(channelId)}/lists`, data).then((res) => res.data);

export const getList = (listId: string) =>
  client.get<ListDetail>(`/lists/${listId}`).then((res) => res.data);

export const updateList = (listId: string, data: { name?: string; icon?: string }) =>
  client.put<ListSummary>(`/lists/${listId}`, data).then((res) => res.data);

export const deleteList = (listId: string) => client.delete(`/lists/${listId}`).then((res) => res.data);

export const createField = (
  listId: string,
  data: { name: string; type: ListFieldType; options?: string[] }
) => client.post<ListField>(`/lists/${listId}/fields`, data).then((res) => res.data);

export const updateField = (fieldId: string, data: { name?: string; options?: string[] }) =>
  client.put<ListField>(`/fields/${fieldId}`, data).then((res) => res.data);

export const deleteField = (fieldId: string) => client.delete(`/fields/${fieldId}`).then((res) => res.data);

export const createItem = (listId: string, values: Record<string, unknown> = {}, parentItemId?: string) =>
  client.post<ListItemRow>(`/lists/${listId}/items`, { values, parent_item_id: parentItemId }).then((res) => res.data);

export const updateItem = (itemId: string, values: Record<string, unknown>) =>
  client.put<ListItemRow>(`/items/${itemId}`, { values }).then((res) => res.data);

export const deleteItem = (itemId: string) => client.delete(`/items/${itemId}`).then((res) => res.data);

export const getItemComments = (itemId: string) =>
  client.get<ListItemComment[]>(`/items/${itemId}/comments`).then((res) => res.data);

export const addItemComment = (itemId: string, body: string) =>
  client.post<ListItemComment>(`/items/${itemId}/comments`, { body }).then((res) => res.data);

export const deleteItemComment = (commentId: number) =>
  client.delete(`/item-comments/${commentId}`).then((res) => res.data);

export interface ImportColumn {
  fieldId?: string;
  name?: string;
  type?: ListFieldType;
}

export const importListCsv = (listId: string, columns: ImportColumn[], rows: string[][]) =>
  client
    .post<{ success: boolean; imported: number }>(`/lists/${listId}/import`, { columns, rows })
    .then((res) => res.data);

export const exportListCsvText = (listId: string) =>
  client.get<string>(`/lists/${listId}/export`, { responseType: "text" }).then((res) => res.data);
