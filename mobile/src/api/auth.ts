import { client } from "./client";
import type { User } from "../types/api";

export interface SignInResponse {
  success: boolean;
  session: string;
  user: User;
}

// The Google sign-in path returns this instead when the account has 2FA
// enabled — no session yet, a second emailed code has to land first (see
// verifyTwoFactor). The email-OTP path never returns this shape: it's
// already a form of email-verified auth, so a second code there would be
// redundant.
export interface TwoFactorRequired {
  twofa_required: true;
  twofa_token: string;
}

export const me = () =>
  client.get<{ user: User }>("/auth/me").then((res) => res.data.user);

export const signInWithGoogle = (idToken: string) =>
  client.post<SignInResponse | TwoFactorRequired>("/auth/google", { idToken }).then((res) => res.data);

export const requestOtp = (email: string) =>
  client.post<{ success: boolean }>("/auth/otp/request", { email }).then((res) => res.data);

export const verifyOtp = (email: string, code: string) =>
  client.post<SignInResponse>("/auth/otp/verify", { email, code }).then((res) => res.data);

export const verifyTwoFactor = (twofaToken: string, code: string) =>
  client.post<SignInResponse>("/auth/2fa/verify", { twofa_token: twofaToken, code }).then((res) => res.data);

export const resendTwoFactor = (twofaToken: string) =>
  client.post<{ success: boolean }>("/auth/2fa/resend", { twofa_token: twofaToken }).then((res) => res.data);

// Enrollment (from Settings) — requires an active session, unlike the
// sign-in-step endpoints above.
export const startTwoFactorEnroll = () =>
  client.post<{ success: boolean }>("/auth/2fa/enable/start").then((res) => res.data);

export const confirmTwoFactorEnroll = (code: string) =>
  client.post<{ success: boolean; user: User }>("/auth/2fa/enable/confirm", { code }).then((res) => res.data.user);

export const disableTwoFactor = () =>
  client.post<{ success: boolean; user: User }>("/auth/2fa/disable").then((res) => res.data.user);
