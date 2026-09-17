import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { WALLPAPERS, wallpaperColor } from "../lib/wallpapers";
import { useThemeColors, useIsDarkMode } from "../state/themeStore";

export default function WallpaperPicker({
  visible,
  current,
  onPick,
  onClose,
}: {
  visible: boolean;
  current: string | null;
  onPick: (key: string | null) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Chat wallpaper</Text>
          <View style={styles.grid}>
            {WALLPAPERS.map((w) => (
              <Pressable key={w.key ?? "default"} style={styles.item} onPress={() => onPick(w.key)}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: wallpaperColor(w.key, isDark) || (isDark ? "#0f172a" : "#f1f5f9") },
                    current === w.key && styles.swatchSelected,
                  ]}
                />
                <Text style={styles.label}>{w.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  item: {
    alignItems: "center",
    gap: 6,
    width: 64,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: colors.primary,
  },
  label: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
