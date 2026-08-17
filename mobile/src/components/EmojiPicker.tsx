import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useThemeColors } from "../state/themeStore";

// A broad curated grid rather than a full Unicode emoji library (no new
// dependency) — plus a text input that accepts anything typed via the
// device's own emoji keyboard, so this isn't actually capped to the grid.
const EMOJI_GRID = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😜", "🤔", "😎", "🥳", "😢",
  "😭", "😡", "🤯", "😱", "🥺", "😴", "🤒", "🤗", "🙄", "😇", "🤩", "😏",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "✌️", "👌", "🤞", "👋", "🫡",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "💯", "🔥", "✨",
  "🎉", "🎊", "🎂", "🎁", "🏆", "⭐", "🚀", "💡", "📌", "✅", "❌", "⚠️",
  "👀", "🧠", "💀", "👻", "🤖", "🐱", "🐶", "🦄", "🍕", "☕", "🍺", "⚽",
];

export default function EmojiPicker({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [custom, setCustom] = useState("");

  const submitCustom = () => {
    const emoji = custom.trim();
    if (!emoji) return;
    onPick(emoji);
    setCustom("");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>React with</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.grid}>
            {EMOJI_GRID.map((e) => (
              <Pressable key={e} style={styles.cell} onPress={() => onPick(e)}>
                <Text style={styles.emoji}>{e}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.customRow}>
            <TextInput
              value={custom}
              onChangeText={setCustom}
              placeholder="Or type/paste any emoji"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <Pressable onPress={submitCustom} disabled={!custom.trim()} style={styles.reactButton}>
              <Text style={styles.reactButtonText}>React</Text>
            </Pressable>
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
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  close: {
    fontSize: 16,
    color: colors.textMuted,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: "16.66%",
    paddingVertical: 6,
    alignItems: "center",
  },
  emoji: {
    fontSize: 22,
  },
  customRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
  },
  reactButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  reactButtonText: {
    color: colors.primaryText,
    fontWeight: "600",
    fontSize: 12,
  },
});
