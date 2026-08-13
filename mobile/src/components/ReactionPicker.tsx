import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useThemeColors } from "../state/themeStore";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export default function ReactionPicker({
  visible,
  canEdit,
  canDelete,
  isPinned,
  onSelect,
  onEdit,
  onDelete,
  onPin,
  onClose,
}: {
  visible: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isPinned: boolean;
  onSelect: (emoji: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

          <Pressable
            style={styles.actionButton}
            onPress={() => {
              onPin?.();
              onClose();
            }}
          >
            <Text style={styles.actionText}>{isPinned ? "Unpin message" : "Pin message"}</Text>
          </Pressable>

          {canEdit ? (
            <Pressable
              style={styles.actionButton}
              onPress={() => {
                onEdit?.();
                onClose();
              }}
            >
              <Text style={styles.actionText}>Edit message</Text>
            </Pressable>
          ) : null}

          {canDelete ? (
            <Pressable
              style={styles.actionButton}
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

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
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
    gap: 4,
    minWidth: 260,
  },
  emojiRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  emojiButton: {
    padding: 6,
  },
  emoji: {
    fontSize: 28,
  },
  actionButton: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionText: {
    color: colors.text,
    fontWeight: "600",
  },
  deleteText: {
    color: colors.danger,
    fontWeight: "600",
  },
});
