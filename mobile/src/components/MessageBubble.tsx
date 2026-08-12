import { useMemo, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import ReactionPicker from "./ReactionPicker";
import EditMessageModal from "./EditMessageModal";
import { resolveMediaUrl } from "../constants/config";
import { clockLabel } from "../lib/format";
import { colors } from "../theme/colors";
import type { Message } from "../types/api";

export default function MessageBubble({
  message,
  isOwn,
  onReact,
  onDelete,
  onEdit,
  onPin,
}: {
  message: Message;
  isOwn: boolean;
  onReact: (emoji: string) => void;
  onDelete: () => void;
  onEdit: (text: string) => void;
  onPin: (pinned: boolean) => void;
}) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);

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
  // filename (added specifically so recipients see/save the real name
  // instead of "1755-report.pdf"), falling back to the URL's last segment
  // only for messages sent before that field existed.
  const fileName = message.attachments?.[0]?.name || attachmentUrl?.split("/").pop() || "file";
  const canEdit = isOwn && message.type === "text";

  // Downloads the attachment into cache under its real name, then hands it
  // to the OS share sheet — which lets the user pick an app to open it in,
  // or (on most Android share sheets) a "Save to device"/"Files" target.
  // There's no dedicated save-to-storage API in this Expo SDK without a new
  // native dependency, so "open" and "save" both funnel through this same
  // native chooser; the two entry points below exist so a person doesn't
  // have to guess that one gesture does both.
  const downloadToCache = async () => {
    if (!attachmentUrl) throw new Error("No attachment URL");
    const destination = new File(Paths.cache, fileName);
    return File.downloadFileAsync(attachmentUrl, destination, { idempotent: true });
  };

  const handleOpen = async () => {
    try {
      const file = await downloadToCache();
      await Sharing.shareAsync(file.uri, { dialogTitle: `Open ${fileName}` });
    } catch (e) {
      Alert.alert("Couldn't open file", e instanceof Error ? e.message : "Please try again.");
    }
  };

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
          <Image source={{ uri: attachmentUrl }} style={styles.image} resizeMode="cover" />
        ) : message.type === "file" && attachmentUrl ? (
          <Pressable onPress={handleOpen} onLongPress={onFileLongPress} style={styles.fileRow}>
            <Text style={styles.fileIcon}>📎</Text>
            <Text style={styles.fileText} numberOfLines={1}>
              {fileName}
            </Text>
          </Pressable>
        ) : null}

        {message.text ? <Text style={styles.text}>{message.text}</Text> : null}
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
        canDelete={isOwn}
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
    </View>
  );
}

const styles = StyleSheet.create({
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
});
