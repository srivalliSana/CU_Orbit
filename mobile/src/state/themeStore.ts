import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { useColorScheme } from "react-native";

import { darkColors, lightColors, type ThemeColors } from "../theme/colors";

const THEME_KEY = "orbit_theme_mode";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeState {
  mode: ThemeMode;
  hydrate: () => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: "system",

  hydrate: async () => {
    const stored = await SecureStore.getItemAsync(THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      set({ mode: stored });
    }
  },

  setMode: async (mode) => {
    await SecureStore.setItemAsync(THEME_KEY, mode);
    set({ mode });
  },
}));

/** Live-updating palette for use inside components. */
export function useThemeColors(): ThemeColors {
  const mode = useThemeStore((s) => s.mode);
  const systemScheme = useColorScheme();
  const resolved = mode === "system" ? systemScheme ?? "light" : mode;
  return resolved === "dark" ? darkColors : lightColors;
}
