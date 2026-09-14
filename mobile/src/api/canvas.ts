import { client } from "./client";

export interface CanvasRow {
  id: string;
  channel_id: string;
  title: string;
  body: string;
  created_by: string;
  updated_by: string | null;
  updatedAt: string;
}

export const getCanvas = (channelId: string) =>
  client.get<CanvasRow | null>(`/channels/${channelId}/canvas`).then((res) => res.data);

export const createCanvas = (channelId: string, data: { title?: string; body?: string }) =>
  client.post<CanvasRow>(`/channels/${channelId}/canvas`, data).then((res) => res.data);

export const updateCanvas = (id: string, data: { title?: string; body?: string }) =>
  client.put<CanvasRow>(`/canvas/${id}`, data).then((res) => res.data);

export const deleteCanvas = (id: string) => client.delete(`/canvas/${id}`).then((res) => res.data);
