import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

import type { User } from "../types/api";

const SESSION_KEY = "orbit_session";

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
      set({ token, status: "signedIn" });
    } else {
      set({ status: "signedOut" });
    }
  },

  setSession: async (token, user) => {
    await SecureStore.setItemAsync(SESSION_KEY, token);
    set({ token, user, status: "signedIn" });
  },

  clear: async () => {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    set({ token: null, user: null, status: "signedOut" });
  },

  setPendingJoinCode: (code) => set({ pendingJoinCode: code }),
}));
