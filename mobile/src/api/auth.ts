import { client } from "./client";
import type { SsoExchangeResponse, User } from "../types/api";

export const ssoExchange = (token: string) =>
  client
    .post<SsoExchangeResponse>("/auth/sso", { token })
    .then((res) => res.data);

export const me = () =>
  client.get<{ user: User }>("/auth/me").then((res) => res.data.user);
