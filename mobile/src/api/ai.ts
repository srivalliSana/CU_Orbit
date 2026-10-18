import { client } from "./client";

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  image_url?: string | null;
  created_at: string;
}

export const getAiMessages = () => client.get<AiMessage[]>("/ai/messages").then((res) => res.data);

export const sendAiMessage = (text: string) =>
  client.post<AiMessage>("/ai/messages", { text }).then((res) => res.data);

export const generateAiImage = (prompt: string) =>
  client.post<AiMessage>("/ai/image", { prompt }).then((res) => res.data);

export const clearAiMessages = () => client.delete("/ai/messages").then((res) => res.data);
