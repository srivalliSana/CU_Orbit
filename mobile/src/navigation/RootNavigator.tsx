import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import * as Linking from "expo-linking";

import { useAuthSession } from "../hooks/useAuthSession";
import { useNotifications } from "../hooks/useNotifications";
import { useSocket } from "../hooks/useSocket";
import { useAuthStore } from "../state/authStore";
import { useThemeColors, useThemeStore } from "../state/themeStore";
import AuthStack from "./AuthStack";
import AppShell from "./AppShell";
import { linking } from "./linking";
import { navigationRef } from "./navigationRef";

/** Pulls a join code out of any shape the join link can arrive in:
 *  cuorbit://join/abc123, https://cuorbit.app/join/abc123, or the Expo Go
 *  dev-client exp:// form — all resolve to the same "join/<code>" path. */
function extractJoinCode(url: string): string | null {
  const { path } = Linking.parse(url);
  const match = path?.match(/join\/([^/?#]+)/);
  return match ? match[1] : null;
}

export default function RootNavigator() {
  const { status } = useAuthSession();
  const colors = useThemeColors();
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const setPendingJoinCode = useAuthStore((s) => s.setPendingJoinCode);
  useSocket();
  useNotifications();

  useEffect(() => {
    hydrateTheme();
  }, [hydrateTheme]);

  // Captured independently of react-navigation's own linking config, which
  // only resolves against whichever navigator is currently mounted — while
  // signed out that's AuthStack, which has no JoinChannel route to match.
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      const code = url && extractJoinCode(url);
      if (code) setPendingJoinCode(code);
    });
    const sub = Linking.addEventListener("url", ({ url }) => {
      const code = extractJoinCode(url);
      if (code) setPendingJoinCode(code);
    });
    return () => sub.remove();
  }, [setPendingJoinCode]);

  const navTheme = {
    ...(colors.background === "#0B1220" ? DarkTheme : DefaultTheme),
    colors: {
      ...(colors.background === "#0B1220" ? DarkTheme.colors : DefaultTheme.colors),
      primary: colors.primary,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <NavigationContainer ref={navigationRef} linking={linking} theme={navTheme}>
      {status === "hydrating" ? (
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : status === "signedIn" ? (
        <AppShell />
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
