import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";

import { useAuthSession } from "../hooks/useAuthSession";
import { useSocket } from "../hooks/useSocket";
import { useThemeColors, useThemeStore } from "../state/themeStore";
import AuthStack from "./AuthStack";
import AppShell from "./AppShell";
import { linking } from "./linking";

export default function RootNavigator() {
  const { status } = useAuthSession();
  const colors = useThemeColors();
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  useSocket();

  useEffect(() => {
    hydrateTheme();
  }, [hydrateTheme]);

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
    <NavigationContainer linking={linking} theme={navTheme}>
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
