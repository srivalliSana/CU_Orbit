import { useMemo } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import { useThemeColors } from "../state/themeStore";
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
  onLongPressConfirm,
}: {
  visible: boolean;
  attachments: PendingAttachment[];
  caption: string;
  onChangeCaption: (text: string) => void;
  uploading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onLongPressConfirm?: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!attachments.length) return null;
  const first = attachments[0];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {attachments.length > 1 ? `${attachments.length} files` : first.type === "voice" ? "Voice message" : first.file.name}
          </Text>

          {first.type === "image" ? (
            <Image source={{ uri: first.file.uri }} style={styles.preview} resizeMode="cover" />
          ) : first.type === "voice" ? (
            // Hearing the recording back is what actually prevents an
            // accidental send — a filename alone doesn't tell you what
            // you're about to send.
            <VoicePreview uri={first.file.uri} styles={styles} colors={colors} />
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
              <Text style={styles.cancelText}>{first.type === "voice" && attachments.length === 1 ? "Delete" : "Cancel"}</Text>
            </Pressable>
            <Pressable style={styles.sendButton} onPress={onConfirm} onLongPress={onLongPressConfirm} disabled={uploading}>
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

// A separate component (not inlined) so useAudioPlayer — which must run
// unconditionally, same order every render — only mounts once the pending
// attachment is actually a voice recording. Mirrors MessageBubble's
// VoiceBubble, minus the already-sent-message chrome.
function VoicePreview({ uri, styles, colors }: { uri: string; styles: ReturnType<typeof makeStyles>; colors: ReturnType<typeof useThemeColors> }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const seconds = Math.round((status.playing ? status.currentTime : status.duration) || 0);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  return (
    <Pressable style={styles.voiceRow} onPress={() => (status.playing ? player.pause() : player.play())}>
      <View style={styles.voicePlayButton}>
        <Text style={styles.voicePlayIcon}>{status.playing ? "⏸" : "▶"}</Text>
      </View>
      <View style={styles.voiceTrack}>
        <View style={[styles.voiceTrackFill, { width: `${status.duration ? (status.currentTime / status.duration) * 100 : 0}%` }]} />
      </View>
      <Text style={styles.voiceDuration}>{`${m}:${String(s).padStart(2, "0")}`}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
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
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
  },
  voicePlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  voicePlayIcon: {
    fontSize: 14,
    color: colors.primaryText,
  },
  voiceTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  voiceTrackFill: {
    height: "100%",
    backgroundColor: colors.primary,
  },
  voiceDuration: {
    fontSize: 12,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
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
