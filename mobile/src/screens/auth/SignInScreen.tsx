import { ActivityIndicator, Button, StyleSheet, Text, View } from "react-native";

import { useAuthSession } from "../../hooks/useAuthSession";
import { colors } from "../../theme/colors";

export default function SignInScreen() {
  const { signingIn, error, signIn } = useAuthSession();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CU Orbit</Text>
      <Text style={styles.subtitle}>Sign in with your CampusOne account</Text>

      {signingIn ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : (
        <Button title="Sign in with CampusOne" onPress={signIn} />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 20,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: 12,
  },
  error: {
    color: colors.danger,
    textAlign: "center",
  },
});
