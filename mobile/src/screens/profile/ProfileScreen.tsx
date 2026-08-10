import { Button, StyleSheet, Text, View } from "react-native";

import Avatar from "../../components/Avatar";
import { useAuthSession } from "../../hooks/useAuthSession";
import { colors } from "../../theme/colors";

// Edit profile / settings / dark mode land in Phase 4 — this is just enough
// to show who's signed in and let them sign out.
export default function ProfileScreen() {
  const { user, signOut } = useAuthSession();

  return (
    <View style={styles.container}>
      <Avatar name={user?.name ?? "?"} url={user?.avatarUrl} size={72} />
      <Text style={styles.name}>{user?.name}</Text>
      <Text style={styles.email}>{user?.campusEmail ?? user?.email}</Text>
      <View style={styles.spacer} />
      <Button title="Sign out" color={colors.danger} onPress={signOut} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    padding: 24,
    paddingTop: 48,
    gap: 8,
    backgroundColor: colors.background,
  },
  name: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginTop: 12,
  },
  email: {
    fontSize: 14,
    color: colors.textMuted,
  },
  spacer: {
    height: 32,
  },
});
