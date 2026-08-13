import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Avatar from "./Avatar";
import { timeLabel } from "../lib/format";
import { useThemeColors } from "../state/themeStore";

export interface ChatRowItem {
  id: string;
  kind: "channel" | "dm";
  title: string;
  avatarUrl: string | null;
  previewText: string;
  sentAt: number | null;
  unreadCount: number;
  hasMention: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  presence?: string;
}

export default function ChatListRow({
  item,
  onPress,
  onLongPress,
}: {
  item: ChatRowItem;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable style={styles.row} onPress={onPress} onLongPress={onLongPress}>
      <Avatar name={item.title} url={item.avatarUrl} presence={item.presence} />
      <View style={styles.middle}>
        <Text style={styles.title} numberOfLines={1}>
          {item.isPinned ? "📌 " : ""}
          {item.kind === "channel" ? `# ${item.title}` : item.title}
          {item.isMuted ? " 🔕" : ""}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {item.previewText}
        </Text>
      </View>
      <View style={styles.right}>
        {item.sentAt ? <Text style={styles.time}>{timeLabel(item.sentAt)}</Text> : null}
        {item.unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</Text>
          </View>
        ) : item.hasMention ? (
          <View style={styles.mentionDot} />
        ) : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  middle: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  preview: {
    fontSize: 14,
    color: colors.textMuted,
  },
  right: {
    alignItems: "flex-end",
    gap: 6,
  },
  time: {
    fontSize: 12,
    color: colors.textMuted,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  badgeText: {
    color: colors.primaryText,
    fontSize: 11,
    fontWeight: "700",
  },
  mentionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
  },
});
