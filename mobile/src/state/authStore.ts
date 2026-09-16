import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

import type { User } from "../types/api";

const SESSION_KEY = "orbit_session";
const USER_KEY = "orbit_session_user";

type AuthStatus = "hydrating" | "signedOut" | "signedIn";

interface AuthState {
  status: AuthStatus;
  token: string | null;
  user: User | null;
  // A join/:code deep link opened while signed out: AuthStack has no
  // JoinChannel route for React Navigation's own linking config to resolve
  // against, so the code is held here and consumed once signed in (see
  // RootNavigator/AppShell) instead of being lost.
  pendingJoinCode: string | null;
  hydrate: () => Promise<void>;
  setSession: (token: string, user: User) => Promise<void>;
  updateUser: (user: User) => Promise<void>;
  clear: () => Promise<void>;
  setPendingJoinCode: (code: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "hydrating",
  token: null,
  user: null,
  pendingJoinCode: null,

  hydrate: async () => {
    const token = await SecureStore.getItemAsync(SESSION_KEY);
    if (token) {
      // Restore the last-known profile too — lets the app render
      // immediately (avatar, name, own user id for "is this my message")
      // offline or before the /me revalidation round-trip lands, instead
      // of sitting on a blank user until the network responds.
      const cachedUserJson = await SecureStore.getItemAsync(USER_KEY);
      const cachedUser = cachedUserJson ? (JSON.parse(cachedUserJson) as User) : null;
      set({ token, user: cachedUser, status: "signedIn" });
    } else {
      set({ status: "signedOut" });
    }
  },

  setSession: async (token, user) => {
    await SecureStore.setItemAsync(SESSION_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    set({ token, user, status: "signedIn" });
  },

  // Refreshes the cached profile (e.g. after /me revalidates the token, or
  // a profile edit) without touching the session token itself.
  updateUser: async (user) => {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    set({ user });
  },

  clear: async () => {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ token: null, user: null, status: "signedOut" });
  },

  setPendingJoinCode: (code) => set({ pendingJoinCode: code }),
}));
