import { useMemo } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useHome } from "../../hooks/useHome";
import { useChatActions } from "../../hooks/useChatActions";
import ChatListRow from "../../components/ChatListRow";
import { channelToRow } from "../../lib/chatRows";
import { colors } from "../../theme/colors";
import type { ChatStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<ChatStackParamList, "List">;

// Browse-public / create-channel / member-management land alongside the
// rest of channel administration in a later round — this is the list +
// open-a-channel core, split out of the old unified Home screen.
export default function ChannelsScreen({ navigation }: Props) {
  const { data, isLoading, isRefetching, refetch, error } = useHome();
  const { onLongPress } = useChatActions();

  const rows = useMemo(() => {
    if (!data) return [];
    return data.channels.map(channelToRow).sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return (b.sentAt ?? 0) - (a.sentAt ?? 0);
    });
  }, [data]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Couldn't load your channels.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      renderItem={({ item }) => (
        <ChatListRow
          item={item}
          onPress={() => navigation.navigate("Chat", { containerId: item.id, title: item.title, kind: item.kind })}
          onLongPress={() => onLongPress(item)}
        />
      )}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No channels yet.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: {
    color: colors.danger,
  },
  emptyText: {
    color: colors.textMuted,
  },
});
