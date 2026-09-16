import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { searchMessages, type SearchResult } from "../../api/search";
import { useNavGuard } from "../../hooks/useNavGuard";
import { timeLabel } from "../../lib/format";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

/** Dedicated search results screen — Home's own search box already does a
 *  quick inline lookup mixed with channels/DMs, but this is the focused
 *  "just messages, full results, filter hints visible" view, same idea as
 *  web's new SearchPanel. Same /api/search endpoint, same from:/in:/
 *  before:/after: filter syntax. */
export default function SearchScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const navGuard = useNavGuard();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); setError(null); setLoading(false); return; }
    const mySeq = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      searchMessages(q)
        .then((rows) => { if (mySeq === seq.current) { setResults(rows); setError(null); } })
        .catch((e) => { if (mySeq === seq.current) setError(e instanceof Error ? e.message : "Search failed."); })
        .finally(() => { if (mySeq === seq.current) setLoading(false); });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <View style={styles.container}>
      <TextInput
        autoFocus
        value={query}
        onChangeText={setQuery}
        placeholder="Search messages… try from:priya, in:general"
        placeholderTextColor={colors.textMuted}
        style={styles.search}
      />
      <FlatList
        data={results ?? []}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={
          <View style={styles.center}>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : error ? (
              <Text style={styles.error}>{error}</Text>
            ) : query.trim().length > 0 && query.trim().length < 2 ? (
              <Text style={styles.muted}>Keep typing — at least 2 characters.</Text>
            ) : query.trim() && results?.length === 0 ? (
              <Text style={styles.muted}>No messages match "{query.trim()}".</Text>
            ) : !query.trim() ? (
              <Text style={styles.muted}>
                Search across every channel and DM you're in. Use from:name, in:channel, before:/after: to narrow it down.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item: r }) => {
          const isDm = r.is_dm ?? r.container_id.includes("_");
          const title = r.container_name || r.sender_name;
          return (
            <Pressable
              style={styles.row}
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
              <View style={styles.rowHeader}>
                <Text style={styles.rowContext} numberOfLines={1}>{isDm ? title : `# ${title}`}</Text>
                <Text style={styles.rowTime}>{timeLabel(r.sent_at)}</Text>
              </View>
              <Text style={styles.rowText} numberOfLines={2}>
                <Text style={styles.rowSender}>{r.sender_name}: </Text>
                {r.text || "Attachment"}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  search: {
    margin: 12,
    marginBottom: 4,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  center: { alignItems: "center", justifyContent: "center", padding: 32 },
  muted: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  error: { fontSize: 13, color: colors.danger, textAlign: "center" },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  rowContext: { fontSize: 12, fontWeight: "700", color: colors.primary, flexShrink: 1 },
  rowTime: { fontSize: 11, color: colors.textMuted },
  rowText: { fontSize: 14, color: colors.text },
  rowSender: { fontWeight: "700" },
});
