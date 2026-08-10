import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";

import { useAuthSession } from "../hooks/useAuthSession";
import { useSocket } from "../hooks/useSocket";
import AuthStack from "./AuthStack";
import AppShell from "./AppShell";
import { linking } from "./linking";
import { colors } from "../theme/colors";

export default function RootNavigator() {
  const { status } = useAuthSession();
  useSocket();

  return (
    <NavigationContainer linking={linking}>
      {status === "hydrating" ? (
        <View style={styles.center}>
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
    backgroundColor: colors.background,
  },
});
