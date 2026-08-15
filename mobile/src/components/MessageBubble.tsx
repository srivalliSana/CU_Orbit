import { useMemo, useState } from "react";
import { Alert, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { VideoView, useVideoPlayer } from "expo-video";

import ReactionPicker from "./ReactionPicker";
import EditMessageModal from "./EditMessageModal";
import { linkify } from "../lib/linkify";
import { resolveMediaUrl } from "../constants/config";
import { clockLabel } from "../lib/format";
import { useThemeColors } from "../state/themeStore";
import type { Message } from "../types/api";

const FLAG_GRANT_READ_URI_PERMISSION = 1;

export default function MessageBubble({
  message,
  isOwn,
  canModerate,
  isSuperAdmin,
  onReact,
  onDelete,
  onEdit,
  onPin,
}: {
  message: Message;
  isOwn: boolean;
  canModerate?: boolean;
  isSuperAdmin?: boolean;
  onReact: (emoji: string) => void;
  onDelete: () => void;
  onEdit: (text: string) => void;
  onPin: (pinned: boolean) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);

  const reactionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of message.reactions) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
    return [...counts.entries()];
  }, [message.reactions]);

  if (message.type === "system") {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.text}</Text>
      </View>
    );
  }

  const attachmentUrl = resolveMediaUrl(message.attachments?.[0]?.url);
  // The server stores files under a timestamp-prefixed name to avoid
  // collisions on disk — attachments[0].name is the sender's original
  // filename, shown/saved instead of "1755000000000-report.pdf".
  const fileName = message.attachments?.[0]?.name || attachmentUrl?.split("/").pop() || "file";
  const mimeType = message.attachments?.[0]?.mimeType;
  // "SUPERADMIN: edit any message" / "ADMIN: cannot edit others' messages" —
  // edit override is admin-only, unlike delete which channel admins share.
  const canEdit = (isOwn || !!isSuperAdmin) && message.type === "text";
  const canDelete = isOwn || !!canModerate;

  const downloadToCache = async () => {
    if (!attachmentUrl) throw new Error("No attachment URL");
    const destination = new File(Paths.cache, fileName);
    return File.downloadFileAsync(attachmentUrl, destination, { idempotent: true });
  };

  // Real "open with the app registered for this file type, or ask which
  // app" behaviour (ACTION_VIEW) — not the share sheet, which is a
  // different Android intent (ACTION_SEND, for sending content to another
  // app) that was being used here before and confused the two.
  // getContentUriAsync wraps the download in the FileProvider content:// URI
  // ACTION_VIEW requires; Expo's build already registers that provider, no
  // manual native config needed.
  const handleOpen = async () => {
    if (Platform.OS !== "android") {
      // iOS has no equivalent chooser API in Expo; fall back to sharing.
      try {
        const file = await downloadToCache();
        await Sharing.shareAsync(file.uri, { dialogTitle: `Open ${fileName}` });
      } catch (e) {
        Alert.alert("Couldn't open file", e instanceof Error ? e.message : "Please try again.");
      }
      return;
    }
    try {
      const file = await downloadToCache();
      const contentUri = await FileSystemLegacy.getContentUriAsync(file.uri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        type: mimeType,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      });
    } catch (e) {
      Alert.alert("Couldn't open file", e instanceof Error ? e.message : "Please try again.");
    }
  };

  // Saving to a user-chosen location has no dedicated API in this Expo SDK
  // without a new native dependency — the share sheet is the practical
  // stand-in; most Android share sheets include a "Save to device"/Files
  // target among the apps offered.
  const handleSave = async () => {
    try {
      const file = await downloadToCache();
      await Sharing.shareAsync(file.uri, { dialogTitle: `Save ${fileName}` });
    } catch (e) {
      Alert.alert("Couldn't save file", e instanceof Error ? e.message : "Please try again.");
    }
  };

  const onFileLongPress = () => {
    Alert.alert(fileName, undefined, [
      { text: "Open", onPress: handleOpen },
      { text: "Save to device", onPress: handleSave },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
      {message.is_pinned ? <Text style={styles.pinnedLabel}>📌 Pinned</Text> : null}
      <Pressable
        onLongPress={() => setPickerVisible(true)}
        style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}
      >
        {!isOwn ? <Text style={styles.senderName}>{message.sender_name}</Text> : null}

        {message.type === "image" && attachmentUrl ? (
          <Pressable onPress={() => setImageViewerVisible(true)}>
            <Image source={{ uri: attachmentUrl }} style={styles.image} resizeMode="cover" />
          </Pressable>
        ) : message.type === "video" && attachmentUrl ? (
          <VideoBubble uri={attachmentUrl} style={styles.image} />
        ) : message.type === "file" && attachmentUrl ? (
          <Pressable onPress={handleOpen} onLongPress={onFileLongPress} style={styles.fileRow}>
            <Text style={styles.fileIcon}>📎</Text>
            <Text style={styles.fileText} numberOfLines={1}>
              {fileName}
            </Text>
          </Pressable>
        ) : null}

        {message.text ? (
          <Text style={styles.text}>{linkify(message.text, styles.link)}</Text>
        ) : null}
        <View style={styles.metaRow}>
          {message.edited_at ? <Text style={styles.edited}>edited</Text> : null}
          <Text style={styles.time}>{clockLabel(message.sent_at)}</Text>
        </View>

        {reactionCounts.length > 0 ? (
          <View style={styles.reactionsRow}>
            {reactionCounts.map(([emoji, count]) => (
              <Pressable key={emoji} style={styles.reactionChip} onPress={() => onReact(emoji)}>
                <Text style={styles.reactionText}>
                  {emoji} {count > 1 ? count : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Pressable>

      <ReactionPicker
        visible={pickerVisible}
        canEdit={canEdit}
        canDelete={canDelete}
        isPinned={!!message.is_pinned}
        onSelect={onReact}
        onEdit={() => setEditVisible(true)}
        onDelete={onDelete}
        onPin={() => onPin(!message.is_pinned)}
        onClose={() => setPickerVisible(false)}
      />

      <EditMessageModal
        visible={editVisible}
        initialText={message.text}
        onSave={onEdit}
        onClose={() => setEditVisible(false)}
      />

      {message.type === "image" && attachmentUrl ? (
        <Modal
          visible={imageViewerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setImageViewerVisible(false)}
        >
          <Pressable style={styles.viewerBackdrop} onPress={() => setImageViewerVisible(false)}>
            <Image source={{ uri: attachmentUrl }} style={styles.viewerImage} resizeMode="contain" />
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

// A separate component (not inlined in MessageBubble) so useVideoPlayer —
// which must run unconditionally, same order every render — only mounts for
// rows that are actually a video, instead of needing a guard inside a hook.
function VideoBubble({ uri, style }: { uri: string; style: object }) {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      player={player}
      style={style}
      nativeControls
      // The native controls already include a fullscreen toggle; this just
      // confirms the platform is allowed to honour it.
      fullscreenOptions={{ enable: true }}
    />
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  row: {
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  rowOwn: {
    alignItems: "flex-end",
  },
  rowOther: {
    alignItems: "flex-start",
  },
  pinnedLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 2,
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleOwn: {
    backgroundColor: colors.bubbleSelf,
  },
  bubbleOther: {
    backgroundColor: colors.bubbleOther,
  },
  senderName: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 2,
  },
  text: {
    fontSize: 15,
    color: colors.text,
  },
  link: {
    color: colors.primary,
    textDecorationLine: "underline",
  },
  image: {
    width: 220,
    height: 220,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: colors.surface,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  fileIcon: {
    fontSize: 18,
  },
  fileText: {
    fontSize: 14,
    color: colors.primary,
    maxWidth: 180,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  edited: {
    fontSize: 10,
    fontStyle: "italic",
    color: colors.textMuted,
  },
  time: {
    fontSize: 10,
    color: colors.textMuted,
  },
  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  reactionChip: {
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  reactionText: {
    fontSize: 12,
  },
  systemRow: {
    alignItems: "center",
    marginVertical: 8,
  },
  systemText: {
    fontSize: 12,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  viewerImage: {
    width: "100%",
    height: "100%",
  },
});
