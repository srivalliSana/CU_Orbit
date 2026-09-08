import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useThemeColors, useThemeStore, type ThemeMode } from "../../state/themeStore";
import { useAuthStore } from "../../state/authStore";
import { setDoNotDisturb } from "../../api/conversations";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System default" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const DND_OPTIONS = [
  { minutes: 60, label: "For 1 hour" },
  { minutes: 480, label: "For 8 hours" },
  { minutes: 1440, label: "Until tomorrow" },
];

export default function SettingsScreen() {
  const colors = useThemeColors();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const user = useAuthStore((s) => s.user);
  const [dndBusy, setDndBusy] = useState(false);

  const dndUntil = user?.dnd_until ? new Date(user.dnd_until) : null;
  const dndActive = !!dndUntil && dndUntil.getTime() > Date.now();

  const applyDnd = async (minutes: number) => {
    setDndBusy(true);
    try {
      const { dnd_until } = await setDoNotDisturb(minutes);
      if (user) useAuthStore.setState({ user: { ...user, dnd_until } });
    } finally {
      setDndBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Theme</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {THEME_OPTIONS.map((opt, i) => (
          <Pressable
            key={opt.value}
            onPress={() => setMode(opt.value)}
            style={[
              styles.row,
              i < THEME_OPTIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
            ]}
          >
            <Text style={[styles.rowText, { color: colors.text }]}>{opt.label}</Text>
            {mode === opt.value && <Ionicons name="checkmark" size={20} color={colors.primary} />}
          </Pressable>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Notifications</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowText, { color: colors.text }]}>Do not disturb</Text>
            <Text style={[styles.hint, { color: colors.textMuted, padding: 0, marginTop: 2 }]}>
              {dndActive
                ? `Paused until ${dndUntil!.toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}`
                : "All push notifications are on."}
            </Text>
          </View>
          {dndBusy && <ActivityIndicator size="small" color={colors.primary} />}
          {dndActive && !dndBusy && (
            <Pressable onPress={() => applyDnd(0)}>
              <Text style={[styles.rowText, { color: colors.primary, fontSize: 13 }]}>Turn off</Text>
            </Pressable>
          )}
        </View>
        {!dndActive && (
          <View style={[styles.dndOptionsRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            {DND_OPTIONS.map((opt) => (
              <Pressable key={opt.minutes} onPress={() => applyDnd(opt.minutes)} disabled={dndBusy} style={styles.dndOption}>
                <Text style={[styles.dndOptionText, { color: colors.primary }]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Privacy</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.row}>
          <Text style={[styles.rowText, { color: colors.text }]}>Profile visibility</Text>
          <Text style={[styles.rowValue, { color: colors.textMuted }]}>Campus directory</Text>
        </View>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Your name, avatar, and status are visible to other Let's Connect users in
          your channels and DMs. Your campus email is only shown to people
          you message directly.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowText: {
    fontSize: 15,
  },
  rowValue: {
    fontSize: 13,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    padding: 14,
    paddingTop: 0,
  },
  dndOptionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 14,
  },
  dndOption: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  dndOptionText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
