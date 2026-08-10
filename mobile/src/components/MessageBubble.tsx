import { useMemo, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import ReactionPicker from "./ReactionPicker";
import { resolveMediaUrl } from "../constants/config";
import { clockLabel } from "../lib/format";
import { colors } from "../theme/colors";
import type { Message } from "../types/api";

export default function MessageBubble({
  message,
  isOwn,
  onReact,
  onDelete,
}: {
  message: Message;
  isOwn: boolean;
  onReact: (emoji: string) => void;
  onDelete: () => void;
}) {
  const [pickerVisible, setPickerVisible] = useState(false);

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

  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
      <Pressable
        onLongPress={() => setPickerVisible(true)}
        style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}
      >
        {!isOwn ? <Text style={styles.senderName}>{message.sender_name}</Text> : null}

        {message.type === "image" && attachmentUrl ? (
          <Image source={{ uri: attachmentUrl }} style={styles.image} resizeMode="cover" />
        ) : message.type === "file" && attachmentUrl ? (
          <Pressable onPress={() => Linking.openURL(attachmentUrl)} style={styles.fileRow}>
            <Text style={styles.fileIcon}>📎</Text>
            <Text style={styles.fileText} numberOfLines={1}>
              {message.attachments[0]?.url.split("/").pop() || "Attachment"}
            </Text>
          </Pressable>
        ) : null}

        {message.text ? <Text style={styles.text}>{message.text}</Text> : null}
        <Text style={styles.time}>{clockLabel(message.sent_at)}</Text>

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
        canDelete={isOwn}
        onSelect={onReact}
        onDelete={onDelete}
        onClose={() => setPickerVisible(false)}
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
  time: {
    fontSize: 10,
    color: colors.textMuted,
    alignSelf: "flex-end",
    marginTop: 4,
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
