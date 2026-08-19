import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { getPinnedMessages, getSharedMedia, getStarredMessages, type StarredMessage } from "../../api/messages";
import { openFile, saveFile } from "../../lib/fileActions";
import { resolveMediaUrl } from "../../constants/config";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "MessageList">;

const MEDIA_CATEGORIES: { key: string; label: string }[] = [
  { key: "image", label: "Photos" },
  { key: "video", label: "Videos" },
  { key: "document", label: "Documents" },
  { key: "link", label: "Links" },
];

/**
 * One screen for all three "browse messages" views channel info links to —
 * pinned, starred (private bookmarks), and shared media by category — since
 * they share the same list-of-message-snippets shape.
 */
export default function MessageListScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { containerId, mode, title, chatTitle, chatKind } = route.params;
  const [category, setCategory] = useState("image");
  const [items, setItems] = useState<(StarredMessage & { links?: string[] })[] | null>(null);

  useEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  useEffect(() => {
    setItems(null);
    const fetcher =
      mode === "pinned" ? getPinnedMessages(containerId)
      : mode === "starred" ? getStarredMessages(containerId)
      : getSharedMedia(containerId, category);
    fetcher.then(setItems).catch(() => setItems([]));
  }, [mode, category, containerId]);

  return (
    <View style={styles.container}>
      {mode === "media" ? (
        <View style={styles.categoryRow}>
          {MEDIA_CATEGORIES.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => setCategory(c.key)}
              style={[styles.categoryChip, category === c.key && styles.categoryChipActive]}
            >
              <Text style={[styles.categoryText, category === c.key && styles.categoryTextActive]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {items === null ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Nothing here yet.</Text>}
          renderItem={({ item }) => {
            const jumpToChat = () => navigation.navigate("Chat", {
              containerId,
              title: chatTitle,
              kind: chatKind,
              scrollToMessageId: item.id,
            });

            // A document doesn't get tapped to jump straight into a
            // download the way it used to — it offers a choice, same as
            // long-pressing a file bubble in the chat itself.
            const isDocument = mode === "media" && category === "document";
            const attachment = item.attachments?.[0];
            const onPress = isDocument
              ? () => {
                  const url = attachment ? resolveMediaUrl(attachment.url) : null;
                  const fileName = attachment?.name || "file";
                  Alert.alert(fileName, undefined, [
                    { text: "Locate in chat", onPress: jumpToChat },
                    ...(url ? [
                      { text: "Open", onPress: () => openFile(url, fileName, attachment?.mimeType) },
                      { text: "Save to device", onPress: () => saveFile(url, fileName) },
                    ] : []),
                    { text: "Cancel", style: "cancel" as const },
                  ]);
                }
              : jumpToChat;

            const content = (
              <>
                <Text style={styles.sender}>{item.sender_name}</Text>
                {mode === "media" && category === "link" ? (
                  (item.links ?? []).map((url, i) => (
                    <Pressable key={i} onPress={() => Linking.openURL(url)}>
                      <Text style={styles.link} numberOfLines={1}>{url}</Text>
                    </Pressable>
                  ))
                ) : (
                  <Text style={styles.text} numberOfLines={2}>{item.text || "Attachment"}</Text>
                )}
              </>
            );
            return (
              <Pressable style={styles.row} onPress={onPress}>
                {content}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { marginTop: 40 },
  categoryRow: {
    flexDirection: "row",
    gap: 6,
    padding: 10,
  },
  categoryChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  categoryTextActive: {
    color: colors.primaryText,
  },
  list: { padding: 12, gap: 8 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 24 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  sender: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  text: { fontSize: 14, color: colors.text, marginTop: 2 },
  link: { fontSize: 13, color: colors.primary, textDecorationLine: "underline", marginTop: 2 },
});
