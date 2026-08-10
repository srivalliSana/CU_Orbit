import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "../theme/colors";

export default function EditMessageModal({
  visible,
  initialText,
  onSave,
  onClose,
}: {
  visible: boolean;
  initialText: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (visible) setText(initialText);
  }, [visible, initialText]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Edit message</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            style={styles.input}
            multiline
            autoFocus
          />
          <View style={styles.actions}>
            <Pressable style={styles.button} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.button}
              disabled={!text.trim()}
              onPress={() => {
                onSave(text.trim());
                onClose();
              }}
            >
              <Text style={[styles.saveText, !text.trim() && styles.disabled]}>Save</Text>
            </Pressable>
          </View>
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
    padding: 24,
  },
  sheet: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    width: "100%",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: colors.text,
    minHeight: 60,
    maxHeight: 160,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 20,
  },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  cancelText: {
    color: colors.textMuted,
    fontWeight: "600",
  },
  saveText: {
    color: colors.primary,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.4,
  },
});
