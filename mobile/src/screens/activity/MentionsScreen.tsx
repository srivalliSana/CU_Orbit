import { useNavigation } from "@react-navigation/native";
import { useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { useMentions } from "../../hooks/useMentions";
import { useThemeColors } from "../../state/themeStore";
import { timeLabel } from "../../lib/format";

// Reused from both the Home stack's "Mentions" shortcut row and the bottom
// Activity tab, so it's typed against the minimal shape both stacks share
// rather than either one specifically.
interface MentionsNavigation {
  navigate: (
    screen: "Chat",
    params: { containerId: string; title: string; kind: "channel" | "dm" }
  ) => void;
}

export default function MentionsScreen() {
  const navigation = useNavigation<MentionsNavigation & ReturnType<typeof useNavigation>>();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data, isLoading, markRead } = useMentions();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Pressable
          style={[styles.row, !item.is_read && styles.rowUnread]}
          onPress={() => {
            if (!item.is_read) markRead.mutate(item.id);
            navigation.navigate("Chat", {
              containerId: item.channel_id,
              title: item.channel_name,
              kind: item.channel_id.includes("_") ? "dm" : "channel",
            });
          }}
        >
          <Text style={styles.channel}>{item.channel_name}</Text>
          <Text style={styles.text} numberOfLines={2}>
            <Text style={styles.sender}>{item.sender_name}: </Text>
            {item.text}
          </Text>
          <Text style={styles.time}>{timeLabel(item.sent_at)}</Text>
        </Pressable>
      )}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No mentions yet.</Text>
        </View>
      }
    />
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    color: colors.textMuted,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 2,
  },
  rowUnread: {
    backgroundColor: colors.bubbleSelf,
  },
  channel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  sender: {
    fontWeight: "600",
    color: colors.text,
  },
  text: {
    fontSize: 14,
    color: colors.text,
  },
  time: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
