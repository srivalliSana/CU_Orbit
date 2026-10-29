import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useThemeColors } from "../state/themeStore";

export interface ActionSheetAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
}

/** A themed bottom sheet for a row's "more actions" — replaces the bare OS
 *  Alert.alert button list, which renders as plain grey system UI with no
 *  icons and doesn't match the rest of the app. */
export default function ActionSheet({
  visible,
  title,
  subtitle,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  actions: ActionSheetAction[];
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>

          {actions.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => { onClose(); a.onPress(); }}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={[styles.iconWrap, a.destructive && styles.iconWrapDanger]}>
                <Ionicons name={a.icon} size={18} color={a.destructive ? colors.danger : colors.primary} />
              </View>
              <Text style={[styles.rowLabel, a.destructive && { color: colors.danger }]}>{a.label}</Text>
            </Pressable>
          ))}

          <Pressable onPress={onClose} style={[styles.row, styles.cancelRow]}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 8,
      paddingHorizontal: 8,
    },
    grabber: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 10,
    },
    header: {
      paddingHorizontal: 14,
      paddingBottom: 10,
      marginBottom: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    title: { fontSize: 14, fontWeight: "700", color: colors.text },
    subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderRadius: 12,
    },
    rowPressed: {
      backgroundColor: colors.background,
    },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    iconWrapDanger: {
      backgroundColor: "rgba(239,68,68,0.12)",
    },
    rowLabel: { fontSize: 14.5, fontWeight: "600", color: colors.text },
    cancelRow: {
      marginTop: 6,
      justifyContent: "center",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      borderRadius: 0,
      paddingTop: 14,
    },
    cancelLabel: { fontSize: 14.5, fontWeight: "700", color: colors.textMuted },
  });
