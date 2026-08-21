import { client } from "./client";

export const registerPushToken = (token: string) =>
  client.put<{ success: boolean }>("/users/me/push-token", { token }).then((res) => res.data);
