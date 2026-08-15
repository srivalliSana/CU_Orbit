import { client } from "./client";
import type { User } from "../types/api";

export interface SignInResponse {
  success: boolean;
  session: string;
  user: User;
}

export const me = () =>
  client.get<{ user: User }>("/auth/me").then((res) => res.data.user);

export const signInWithGoogle = (idToken: string) =>
  client.post<SignInResponse>("/auth/google", { idToken }).then((res) => res.data);

export const requestOtp = (email: string) =>
  client.post<{ success: boolean }>("/auth/otp/request", { email }).then((res) => res.data);

export const verifyOtp = (email: string, code: string) =>
  client.post<SignInResponse>("/auth/otp/verify", { email, code }).then((res) => res.data);
