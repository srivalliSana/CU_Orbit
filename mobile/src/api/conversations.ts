import { client } from "./client";

export const setConversationPref = (
  containerId: string,
  action: "pin" | "mute" | "hide" | "delete" | "wallpaper",
  value: boolean | string | null,
  durationMinutes?: number
) =>
  client
    .post(`/conversations/${encodeURIComponent(containerId)}/prefs`, {
      action,
      value,
      duration_minutes: durationMinutes,
    })
    .then((res) => res.data);

export const getConversationPrefs = (containerId: string) =>
  client
    .get<{ wallpaper: string | null }>(`/conversations/${encodeURIComponent(containerId)}/prefs`)
    .then((res) => res.data);

export const setDoNotDisturb = (minutes: number) =>
  client.post<{ success: boolean; dnd_until: string | null }>("/users/me/dnd", { minutes }).then((res) => res.data);
