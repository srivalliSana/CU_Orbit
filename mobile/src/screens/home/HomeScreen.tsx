import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useHome } from "../../hooks/useHome";
import { useMentions } from "../../hooks/useMentions";
import { useChatActions } from "../../hooks/useChatActions";
import { searchMessages, type SearchResult } from "../../api/search";
import ChatListRow, { type ChatRowItem } from "../../components/ChatListRow";
import { channelToRow, dmToRow } from "../../lib/chatRows";
import { timeLabel } from "../../lib/format";
import { useAuthStore } from "../../state/authStore";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "List">;

type ListItem =
  | { kind: "shortcut"; id: string; label: string; icon: string; badge?: number; onPress: () => void }
  | { kind: "sectionHeader"; id: string; label: string; onAdd?: () => void }
  | { kind: "row"; id: string; row: ChatRowItem }
  | { kind: "message"; id: string; result: SearchResult };

/** Debounces a fast-changing value — mirrors web's 250ms directory-search debounce. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function HomeScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data, isLoading, isRefetching, refetch, error } = useHome();
  const { data: mentions } = useMentions();
  const { onLongPress } = useChatActions();
  const [query, setQuery] = useState("");
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const debouncedQuery = useDebounced(query.trim(), 300);
  const pendingJoinCode = useAuthStore((s) => s.pendingJoinCode);
  const setPendingJoinCode = useAuthStore((s) => s.setPendingJoinCode);

  // A join link opened before signing in is held in authStore (see
  // RootNavigator) since AuthStack has no route for it — resume it here,
  // the first screen mounted once signed in.
  useEffect(() => {
    if (!pendingJoinCode) return;
    const code = pendingJoinCode;
    setPendingJoinCode(null);
    navigation.navigate("JoinChannel", { code });
  }, [pendingJoinCode, setPendingJoinCode, navigation]);

  const { data: messageResults } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => searchMessages(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  });

  const unreadMentionCount = useMemo(
    () => (mentions ?? []).filter((m) => !m.is_read).length,
    [mentions]
  );

  const items: ListItem[] = useMemo(() => {
    const term = query.trim().toLowerCase();
    const match = (title: string) => !term || title.toLowerCase().includes(term);

    const channelRows = (data?.channels ?? [])
      .map(channelToRow)
      .filter((r) => match(r.title))
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return (b.sentAt ?? 0) - (a.sentAt ?? 0);
      });

    const dmRows = (data?.dms ?? [])
      .map(dmToRow)
      .filter((r) => match(r.title))
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return (b.sentAt ?? 0) - (a.sentAt ?? 0);
      });

    const list: ListItem[] = [];
    if (!term) {
      list.push({
        kind: "shortcut",
        id: "threads",
        label: "Threads",
        icon: "💬",
        onPress: () => navigation.navigate("Threads"),
      });
      list.push({
        kind: "shortcut",
        id: "mentions",
        label: "Mentions",
        icon: "@",
        badge: unreadMentionCount || undefined,
        onPress: () => navigation.navigate("Mentions"),
      });
    }
    if (term.length >= 2 && messageResults && messageResults.length > 0) {
      list.push({ kind: "sectionHeader", id: "messages-header", label: "Messages" });
      list.push(
        ...messageResults.map((r) => ({ kind: "message" as const, id: `msg-${r.id}`, result: r }))
      );
    }

    list.push({
      kind: "sectionHeader",
      id: "channels-header",
      label: "Channels",
      onAdd: () => navigation.navigate("CreateChannel"),
    });
    list.push(...channelRows.map((row) => ({ kind: "row" as const, id: row.id, row })));
    list.push({ kind: "sectionHeader", id: "dms-header", label: "Direct messages" });
    list.push(...dmRows.map((row) => ({ kind: "row" as const, id: row.id, row })));
    return list;
  }, [data, query, unreadMentionCount, navigation, messageResults]);

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
        <Text style={styles.errorText}>Couldn't load your chats.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Jump to a channel, DM, or file"
        style={styles.search}
      />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        renderItem={({ item }) => {
          if (item.kind === "shortcut") {
            return (
              <Pressable style={styles.shortcutRow} onPress={item.onPress}>
                <Text style={styles.shortcutIcon}>{item.icon}</Text>
                <Text style={styles.shortcutLabel}>{item.label}</Text>
                {item.badge ? (
                  <View style={styles.shortcutBadge}>
                    <Text style={styles.shortcutBadgeText}>{item.badge}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }
          if (item.kind === "sectionHeader") {
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>{item.label.toUpperCase()}</Text>
                {item.onAdd ? (
                  <Pressable onPress={item.onAdd} hitSlop={8}>
                    <Text style={styles.sectionAdd}>+</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }
          if (item.kind === "message") {
            const r = item.result;
            const isDm = r.container_id.includes("_");
            // The search endpoint only returns who sent the matched message,
            // not the container's own name — resolve the real title from
            // what's already loaded rather than showing the sender's name
            // as if it were the chat's title.
            const title = isDm
              ? data?.dms.find((d) => d.id === r.container_id)?.other_user_name || r.sender_name
              : data?.channels.find((c) => c.id === r.container_id)?.name || r.sender_name;
            return (
              <Pressable
                style={styles.messageRow}
                onPress={() =>
                  navigation.navigate("Chat", {
                    containerId: r.container_id,
                    title,
                    kind: isDm ? "dm" : "channel",
                  })
                }
              >
                <Text style={styles.messageSender}>{r.sender_name}</Text>
                <Text style={styles.messageText} numberOfLines={2}>
                  {r.text}
                </Text>
                <Text style={styles.messageTime}>{timeLabel(r.sent_at)}</Text>
              </Pressable>
            );
          }
          return (
            <ChatListRow
              item={item.row}
              onPress={() =>
                navigation.navigate("Chat", {
                  containerId: item.row.id,
                  title: item.row.title,
                  kind: item.row.kind,
                })
              }
              onLongPress={() => onLongPress(item.row)}
            />
          );
        }}
      />

      {fabMenuOpen ? (
        <>
          <Pressable style={styles.fabBackdrop} onPress={() => setFabMenuOpen(false)} />
          <View style={styles.fabMenu}>
            <Pressable
              style={styles.fabMenuRow}
              onPress={() => { setFabMenuOpen(false); navigation.navigate("CreateChannel"); }}
            >
              <View style={styles.fabMenuIconWrap}>
                <Text style={styles.fabMenuIcon}>#</Text>
              </View>
              <View style={styles.fabMenuTextWrap}>
                <Text style={styles.fabMenuTitle}>New channel</Text>
                <Text style={styles.fabMenuSubtitle}>Start a public or private group</Text>
              </View>
            </Pressable>
            <View style={styles.fabMenuDivider} />
            <Pressable
              style={styles.fabMenuRow}
              onPress={() => { setFabMenuOpen(false); navigation.navigate("NewDirectMessage"); }}
            >
              <View style={styles.fabMenuIconWrap}>
                <Text style={styles.fabMenuIcon}>@</Text>
              </View>
              <View style={styles.fabMenuTextWrap}>
                <Text style={styles.fabMenuTitle}>New direct message</Text>
                <Text style={styles.fabMenuSubtitle}>Enter their campus email</Text>
              </View>
            </Pressable>
          </View>
        </>
      ) : null}

      <Pressable style={styles.fab} onPress={() => setFabMenuOpen((v) => !v)}>
        <Text style={styles.fabIcon}>{fabMenuOpen ? "×" : "+"}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: {
    color: colors.danger,
  },
  search: {
    margin: 12,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  shortcutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  shortcutIcon: {
    width: 22,
    textAlign: "center",
    fontSize: 16,
    color: colors.primary,
    fontWeight: "700",
  },
  shortcutLabel: {
    fontSize: 15,
    color: colors.text,
    flex: 1,
  },
  shortcutBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  shortcutBadgeText: {
    color: colors.primaryText,
    fontSize: 11,
    fontWeight: "700",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  sectionAdd: {
    fontSize: 20,
    color: colors.primary,
    fontWeight: "700",
    paddingHorizontal: 6,
  },
  messageRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 2,
  },
  messageSender: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  messageText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  messageTime: {
    fontSize: 11,
    color: colors.textMuted,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  fabIcon: {
    color: colors.primaryText,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: "400",
  },
  fabBackdrop: {
    position: "absolute",
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
  },
  fabMenu: {
    position: "absolute",
    right: 20,
    bottom: 86,
    width: 250,
    borderRadius: 16,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  fabMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fabMenuIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: `${colors.primary}1a`,
    justifyContent: "center",
    alignItems: "center",
  },
  fabMenuIcon: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
  },
  fabMenuTextWrap: {
    flex: 1,
  },
  fabMenuTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  fabMenuSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  fabMenuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },
});
