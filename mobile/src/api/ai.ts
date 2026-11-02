import { client } from "./client";

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  image_url?: string | null;
  created_at: string;
}

export const getAiMessages = () => client.get<AiMessage[]>("/ai/messages").then((res) => res.data);

// The self-hosted model can genuinely take longer to reply than the app's
// normal 15s request timeout (client.ts) — that's fine for every other
// endpoint, but CU AI was hitting it routinely and surfacing as a generic
// "Network Error" even though the server was still working on a reply.
// These match the server's own abort timeouts (60s text, 90s images) with
// a little headroom, so the server's clearer error wins the race instead
// of the client giving up first.
export const sendAiMessage = (text: string) =>
  client.post<AiMessage>("/ai/messages", { text }, { timeout: 65000 }).then((res) => res.data);

export const generateAiImage = (prompt: string) =>
  client.post<AiMessage>("/ai/image", { prompt }, { timeout: 95000 }).then((res) => res.data);

export const editAiImage = (prompt: string, sourceImageUrl: string) =>
  client.post<AiMessage>("/ai/image/edit", { prompt, source_image_url: sourceImageUrl }, { timeout: 95000 }).then((res) => res.data);

export const clearAiMessages = () => client.delete("/ai/messages").then((res) => res.data);
