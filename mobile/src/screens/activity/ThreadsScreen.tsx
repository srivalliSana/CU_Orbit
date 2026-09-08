import { useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { getThreads } from "../../api/threads";
import { useThemeColors } from "../../state/themeStore";
import { timeLabel } from "../../lib/format";
import type { HomeStackParamList } from "../../navigation/types";

/** Every thread I'm part of — I sent the root message, or I sent a reply. */
export default function ThreadsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { data, isLoading, isRefetching, refetch } = useQuery({ queryKey: ["threads"], queryFn: getThreads });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!data?.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No threads yet</Text>
        <Text style={styles.emptySubtitle}>Reply to a message from inside a chat to start one.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.parent_message_id}
      refreshing={isRefetching}
      onRefresh={refetch}
      renderItem={({ item }) => {
        const preview = item.last_reply ?? { sender_name: item.root_sender_name, text: item.root_text, sent_at: item.root_sent_at };
        return (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate("ThreadDetail", { parentId: item.parent_message_id })}
          >
            <View style={styles.rowHeader}>
              <Text style={styles.rowContext} numberOfLines={1}>
                {item.is_dm ? "Direct message" : `#${item.channel_name ?? "channel"}`}
              </Text>
              <Text style={styles.rowTime}>{timeLabel(preview.sent_at)}</Text>
            </View>
            <Text style={styles.rowRoot} numberOfLines={1}>{item.root_text || "Attachment"}</Text>
            <View style={styles.rowPreviewRow}>
              <Text style={styles.rowPreview} numberOfLines={1}>
                <Text style={styles.rowPreviewSender}>{preview.sender_name}: </Text>
                {preview.text || "Attachment"}
              </Text>
              {item.has_unread ? <View style={styles.unreadDot} /> : null}
            </View>
            <Text style={styles.rowReplyCount}>
              {item.reply_count} {item.reply_count === 1 ? "reply" : "replies"}
            </Text>
          </Pressable>
        );
      }}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 16,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 3,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowContext: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
    flexShrink: 1,
  },
  rowTime: {
    fontSize: 11,
    color: colors.textMuted,
  },
  rowRoot: {
    fontSize: 13,
    color: colors.textMuted,
  },
  rowPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowPreview: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  rowPreviewSender: {
    fontWeight: "700",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  rowReplyCount: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
});
