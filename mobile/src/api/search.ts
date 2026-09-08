import { client } from "./client";

export interface SearchResult {
  id: string;
  container_id: string;
  container_name: string | null;
  is_dm: boolean;
  sender_name: string;
  text: string;
  sent_at: number;
  type: string;
}

export const searchMessages = (q: string) =>
  client
    .get<{ messages: SearchResult[] }>("/search", { params: { q } })
    .then((res) => res.data.messages);
