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
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useHome } from "../../hooks/useHome";
import { useMentions } from "../../hooks/useMentions";
import { useChatActions } from "../../hooks/useChatActions";
import { useNavGuard } from "../../hooks/useNavGuard";
import { searchMessages, type SearchResult } from "../../api/search";
import ChatListRow, { type ChatRowItem } from "../../components/ChatListRow";
import { channelToRow, dmToRow } from "../../lib/chatRows";
import { timeLabel } from "../../lib/format";
import { useAuthStore } from "../../state/authStore";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

type Props = NativeStackScreenProps<HomeStackParamList, "List">;

type ListItem =
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
  const navGuard = useNavGuard();
  const [query, setQuery] = useState("");
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const debouncedQuery = useDebounced(query.trim(), 300);
  const pendingJoinCode = useAuthStore((s) => s.pendingJoinCode);
  const setPendingJoinCode = useAuthStore((s) => s.setPendingJoinCode);
  const currentUser = useAuthStore((s) => s.user);

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

  // The channel to feature at the top: whichever has the most unread, or
  // failing that the most recently active one — never a blank/empty pick
  // as long as at least one channel exists.
  const featuredChannel = useMemo(() => {
    const rows = (data?.channels ?? []).map(channelToRow);
    if (!rows.length) return null;
    return [...rows].sort((a, b) => (b.unreadCount ?? 0) - (a.unreadCount ?? 0) || (b.sentAt ?? 0) - (a.sentAt ?? 0))[0];
  }, [data]);

  const items: ListItem[] = useMemo(() => {
    const term = query.trim().toLowerCase();
    const match = (title: string) => !term || title.toLowerCase().includes(term);

    const byRecency = (a: ChatRowItem, b: ChatRowItem) => (b.sentAt ?? 0) - (a.sentAt ?? 0);

    const allChannelRows = (data?.channels ?? []).map(channelToRow).filter((r) => match(r.title));
    const allDmRows = (data?.dms ?? []).map(dmToRow).filter((r) => match(r.title));

    // Pinned conversations get their own section at the top, same as web's
    // sidebar — not just sorted-first within Channels/DMs, actually pulled
    // out into a dedicated "📌 Pinned" group.
    const pinnedRows = [...allChannelRows.filter((r) => r.isPinned), ...allDmRows.filter((r) => r.isPinned)].sort(byRecency);
    const channelRows = allChannelRows.filter((r) => !r.isPinned).sort(byRecency);
    const dmRows = allDmRows.filter((r) => !r.isPinned).sort(byRecency);

    const list: ListItem[] = [];
    if (term.length >= 2 && messageResults && messageResults.length > 0) {
      list.push({ kind: "sectionHeader", id: "messages-header", label: "Messages" });
      list.push(
        ...messageResults.map((r) => ({ kind: "message" as const, id: `msg-${r.id}`, result: r }))
      );
    }

    if (!term && pinnedRows.length > 0) {
      list.push({ kind: "sectionHeader", id: "pinned-header", label: "📌 Pinned" });
      list.push(...pinnedRows.map((row) => ({ kind: "row" as const, id: `pinned-${row.id}`, row })));
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
      <View style={styles.greetingRow}>
        <View>
          <Text style={styles.greetingDate}>
            {new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
          </Text>
          <Text style={styles.greetingText}>
            {greeting()}{currentUser?.name ? `, ${currentUser.name.split(" ")[0]}.` : "."}
          </Text>
        </View>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Jump to a channel, DM, or file"
        placeholderTextColor={colors.textMuted}
        style={styles.search}
      />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListHeaderComponent={
          query.trim() ? null : (
            <View>
              {featuredChannel ? (
                <Pressable
                  style={styles.featuredCard}
                  onPress={() =>
                    navGuard(() =>
                      navigation.navigate("Chat", { containerId: featuredChannel.id, title: featuredChannel.title, kind: "channel" })
                    )
                  }
                >
                  <View style={styles.featuredTopRow}>
                    <View style={styles.featuredMark}>
                      <Text style={styles.featuredMarkText}>#</Text>
                    </View>
                    <Text style={styles.featuredEyebrow} numberOfLines={1}>Your busiest channel</Text>
                  </View>
                  <Text style={styles.featuredTitle} numberOfLines={1}># {featuredChannel.title}</Text>
                  <Text style={styles.featuredPreview} numberOfLines={1}>{featuredChannel.previewText}</Text>
                  {featuredChannel.unreadCount ? (
                    <View style={styles.featuredBadge}>
                      <Text style={styles.featuredBadgeText}>{featuredChannel.unreadCount} new</Text>
                    </View>
                  ) : null}
                </Pressable>
              ) : null}

              <View style={styles.quickGrid}>
                <Pressable style={styles.quickTile} onPress={() => navigation.navigate("Search")}>
                  <View style={styles.quickIcon}>
                    <Ionicons name="search" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.quickLabel}>Search</Text>
                </Pressable>
                <Pressable style={styles.quickTile} onPress={() => navigation.navigate("Mentions")}>
                  <View style={styles.quickIcon}>
                    <Ionicons name="at" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.quickLabel}>Mentions</Text>
                  {unreadMentionCount ? (
                    <View style={styles.quickBadge}>
                      <Text style={styles.quickBadgeText}>{unreadMentionCount}</Text>
                    </View>
                  ) : null}
                </Pressable>
                <Pressable style={styles.quickTile} onPress={() => navigation.navigate("Threads")}>
                  <View style={styles.quickIcon}>
                    <Ionicons name="chatbubbles" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.quickLabel}>Threads</Text>
                </Pressable>
                <Pressable style={styles.quickTile} onPress={() => setFabMenuOpen(true)}>
                  <View style={styles.quickIcon}>
                    <Ionicons name="add" size={22} color={colors.primary} />
                  </View>
                  <Text style={styles.quickLabel}>New</Text>
                </Pressable>
              </View>
            </View>
          )
        }
        renderItem={({ item }) => {
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
            const isDm = r.is_dm ?? r.container_id.includes("_");
            // The search endpoint resolves the container's own name
            // server-side; fall back to whatever's already loaded and
            // finally the sender's name so a title is never blank.
            const title =
              r.container_name ||
              (isDm
                ? data?.dms.find((d) => d.id === r.container_id)?.other_user_name || r.sender_name
                : data?.channels.find((c) => c.id === r.container_id)?.name || r.sender_name);
            return (
              <Pressable
                style={styles.messageRow}
                onPress={() =>
                  navGuard(() =>
                    navigation.navigate("Chat", {
                      containerId: r.container_id,
                      title,
                      kind: isDm ? "dm" : "channel",
                    })
                  )
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
                navGuard(() =>
                  navigation.navigate("Chat", {
                    containerId: item.row.id,
                    title: item.row.title,
                    kind: item.row.kind,
                  })
                )
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
  greetingRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  greetingDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  greetingText: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    marginTop: 2,
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
  featuredCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 18,
    borderRadius: 21,
    backgroundColor: "#0f3d2f",
    overflow: "hidden",
  },
  featuredTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 14,
  },
  featuredMark: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#c6f16d",
    justifyContent: "center",
    alignItems: "center",
  },
  featuredMarkText: {
    color: "#133d30",
    fontWeight: "800",
    fontSize: 13,
  },
  featuredEyebrow: {
    color: "#cfe6dd",
    fontSize: 12,
    flexShrink: 1,
  },
  featuredTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
  featuredPreview: {
    color: "#bfd7ce",
    fontSize: 12,
    marginTop: 6,
  },
  featuredBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#c6f16d",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 12,
  },
  featuredBadgeText: {
    color: "#163428",
    fontSize: 11,
    fontWeight: "800",
  },
  quickGrid: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 10,
  },
  quickTile: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  quickLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
  },
  quickBadge: {
    position: "absolute",
    top: -2,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  quickBadgeText: {
    color: colors.primaryText,
    fontSize: 9,
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
