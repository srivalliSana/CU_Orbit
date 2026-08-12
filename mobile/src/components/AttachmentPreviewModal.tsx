import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "../theme/colors";
import type { PickedFile } from "../api/upload";

export interface PendingAttachment {
  file: PickedFile;
  type: string;
}

export default function AttachmentPreviewModal({
  visible,
  attachments,
  caption,
  onChangeCaption,
  uploading,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  attachments: PendingAttachment[];
  caption: string;
  onChangeCaption: (text: string) => void;
  uploading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!attachments.length) return null;
  const first = attachments[0];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {attachments.length > 1 ? `${attachments.length} files` : first.file.name}
          </Text>

          {first.type === "image" ? (
            <Image source={{ uri: first.file.uri }} style={styles.preview} resizeMode="cover" />
          ) : (
            <View style={styles.filePreview}>
              <Text style={styles.fileIcon}>📎</Text>
              <Text style={styles.fileName} numberOfLines={2}>
                {first.file.name}
              </Text>
            </View>
          )}
          {attachments.length > 1 ? (
            <Text style={styles.moreText}>+{attachments.length - 1} more file(s)</Text>
          ) : null}

          <TextInput
            value={caption}
            onChangeText={onChangeCaption}
            placeholder="Add a caption…"
            style={styles.captionInput}
            multiline
          />

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onCancel} disabled={uploading}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.sendButton} onPress={onConfirm} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={styles.sendText}>Send</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  preview: {
    width: "100%",
    height: 260,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  filePreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
  },
  fileIcon: {
    fontSize: 28,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  moreText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  captionInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    maxHeight: 100,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  cancelText: {
    color: colors.textMuted,
    fontWeight: "600",
  },
  sendButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  sendText: {
    color: colors.primaryText,
    fontWeight: "700",
  },
});
