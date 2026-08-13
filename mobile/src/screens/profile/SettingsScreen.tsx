import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useThemeColors, useThemeStore, type ThemeMode } from "../../state/themeStore";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System default" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function SettingsScreen() {
  const colors = useThemeColors();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

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

      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Privacy</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.row}>
          <Text style={[styles.rowText, { color: colors.text }]}>Profile visibility</Text>
          <Text style={[styles.rowValue, { color: colors.textMuted }]}>Campus directory</Text>
        </View>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Your name, avatar, and status are visible to other CU Orbit users in
          your channels and DMs. Your CampusOne email is only shown to people
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
});
