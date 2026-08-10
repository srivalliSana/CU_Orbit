import { client } from "./client";

export const setConversationPref = (
  containerId: string,
  action: "pin" | "mute" | "hide" | "delete",
  value: boolean
) =>
  client
    .post(`/conversations/${encodeURIComponent(containerId)}/prefs`, { action, value })
    .then((res) => res.data);
