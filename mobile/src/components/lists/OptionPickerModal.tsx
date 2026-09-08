import { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useThemeColors } from "../../state/themeStore";

export interface PickerOption {
  id: string;
  label: string;
  color?: string;
}

/** Generic bottom-sheet single-select — used for a list field's dropdown/
 *  status/priority value, for choosing a field type, and for CSV column
 *  mapping targets. One small reusable picker instead of four bespoke ones. */
export default function OptionPickerModal({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
  allowClear,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  allowClear?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          <ScrollView style={styles.list}>
            {allowClear && (
              <Pressable style={styles.row} onPress={() => { onSelect(""); onClose(); }}>
                <Text style={[styles.rowText, { color: colors.textMuted }]}>None</Text>
                {!selectedId && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </Pressable>
            )}
            {options.map((o) => (
              <Pressable key={o.id} style={styles.row} onPress={() => { onSelect(o.id); onClose(); }}>
                <View style={styles.rowLeft}>
                  {o.color ? <View style={[styles.dot, { backgroundColor: o.color }]} /> : null}
                  <Text style={styles.rowText}>{o.label}</Text>
                </View>
                {selectedId === o.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 14,
    paddingBottom: 24,
    maxHeight: "70%",
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    paddingHorizontal: 18,
    marginBottom: 6,
  },
  list: {
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowText: {
    fontSize: 15,
    color: colors.text,
  },
});
