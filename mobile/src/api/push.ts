import { client } from "./client";

export const registerPushToken = (token: string) =>
  client.put<{ success: boolean }>("/users/me/push-token", { token }).then((res) => res.data);

export const unregisterPushToken = () =>
  client.delete<{ success: boolean }>("/users/me/push-token").then((res) => res.data);
