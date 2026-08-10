import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

import type { User } from "../types/api";

const SESSION_KEY = "orbit_session";

type AuthStatus = "hydrating" | "signedOut" | "signedIn";

interface AuthState {
  status: AuthStatus;
  token: string | null;
  user: User | null;
  hydrate: () => Promise<void>;
  setSession: (token: string, user: User) => Promise<void>;
  clear: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "hydrating",
  token: null,
  user: null,

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
}));
