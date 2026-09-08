import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { startDmByEmail } from "../../api/users";
import { apiErrorMessage } from "../../api/client";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "NewDirectMessage">;

/**
 * Message someone by their campus email — no browsable list of every
 * bulk-provisioned account in the roster, just "type an email, find out
 * whether they're actually on Let's Connect yet." Mirrors the check
 * POST /api/directory/dm does server-side.
 */
export default function NewDirectMessageScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const { dm_id, user } = await startDmByEmail(trimmed);
      navigation.replace("Chat", { containerId: dm_id, title: user.name, kind: "dm" });
    } catch (e) {
      setError(apiErrorMessage(e, "Could not find that person."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Campus email</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={email}
          onChangeText={(v) => { setEmail(v); setError(null); }}
          placeholder="name@cutm.ac.in"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoFocus
          keyboardType="email-address"
          style={styles.input}
          onSubmitEditing={submit}
          returnKeyType="go"
        />
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <Text style={styles.hint}>Only allowed campus domains — if they've used Let's Connect before, you'll message them directly.</Text>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.button,
          (busy || !email.trim()) && styles.buttonDisabled,
          pressed && !busy && email.trim() && styles.buttonPressed,
        ]}
        onPress={submit}
        disabled={busy || !email.trim()}
      >
        {busy ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.buttonText}>Message</Text>}
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.4,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  inputRow: {
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  error: {
    fontSize: 12,
    color: colors.danger,
    lineHeight: 17,
  },
  button: {
    marginTop: 20,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: colors.primaryText,
    fontSize: 14,
    fontWeight: "700",
  },
});
