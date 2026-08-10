import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../theme/colors";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export default function ReactionPicker({
  visible,
  canDelete,
  onSelect,
  onDelete,
  onClose,
}: {
  visible: boolean;
  canDelete: boolean;
  onSelect: (emoji: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.emojiRow}>
            {QUICK_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                style={styles.emojiButton}
                onPress={() => {
                  onSelect(emoji);
                  onClose();
                }}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          {canDelete ? (
            <Pressable
              style={styles.deleteButton}
              onPress={() => {
                onDelete?.();
                onClose();
              }}
            >
              <Text style={styles.deleteText}>Delete message</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  sheet: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    minWidth: 260,
  },
  emojiRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  emojiButton: {
    padding: 6,
  },
  emoji: {
    fontSize: 28,
  },
  deleteButton: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 12,
    alignItems: "center",
  },
  deleteText: {
    color: colors.danger,
    fontWeight: "600",
  },
});
