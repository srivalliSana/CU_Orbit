import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { getPinnedMessages, getSharedMedia, getStarredMessages, type StarredMessage } from "../../api/messages";
import { openFile, saveFile } from "../../lib/fileActions";
import { resolveMediaUrl } from "../../constants/config";
import { useThemeColors } from "../../state/themeStore";
import ZoomableImage from "../../components/ZoomableImage";
import VideoBubble from "../../components/VideoBubble";
import ActionSheet, { type ActionSheetAction } from "../../components/ActionSheet";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "MessageList">;

const MEDIA_TABS: { key: "media" | "files" | "links"; label: string }[] = [
  { key: "media", label: "Media" },
  { key: "files", label: "Files" },
  { key: "links", label: "Links" },
];

type MediaItem = StarredMessage & { links?: string[] };
type ViewerState = { url: string; name: string; kind: "image" | "video"; messageId: string };

const { width } = Dimensions.get("window");
const GRID_GAP = 2;
const TILE_SIZE = (width - GRID_GAP * 2) / 3;

/** One screen for all three "browse messages" views channel/contact info
 *  links to — pinned, starred (private bookmarks), and shared media, the
 *  last split Discord-style into Media (grid, tap to view fullscreen) /
 *  Files / Links sub-tabs instead of a flat list of snippets. */
export default function MessageListScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { containerId, mode, title, chatTitle, chatKind } = route.params;
  const [mediaTab, setMediaTab] = useState<"media" | "files" | "links">("media");
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [fileSheet, setFileSheet] = useState<{ name: string; sender: string; actions: ActionSheetAction[] } | null>(null);

  useEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  const load = () => {
    setItems(null);
    setLoadError(false);
    if (mode !== "media") {
      const fetcher = mode === "pinned" ? getPinnedMessages(containerId) : getStarredMessages(containerId);
      fetcher.then(setItems).catch(() => { setItems([]); setLoadError(true); });
      return;
    }
    if (mediaTab === "files") {
      getSharedMedia(containerId, "document").then(setItems).catch(() => { setItems([]); setLoadError(true); });
    } else if (mediaTab === "links") {
      getSharedMedia(containerId, "link").then(setItems).catch(() => { setItems([]); setLoadError(true); });
    } else {
      Promise.all([getSharedMedia(containerId, "image"), getSharedMedia(containerId, "video")])
        .then(([images, videos]) => setItems([...images, ...videos].sort((a, b) => b.sent_at - a.sent_at)))
        .catch(() => { setItems([]); setLoadError(true); });
    }
  };

  useEffect(load, [mode, mediaTab, containerId]);

  const jumpToChat = (messageId: string) =>
    navigation.navigate("Chat", { containerId, title: chatTitle, kind: chatKind, scrollToMessageId: messageId });

  return (
    <View style={styles.container}>
      {mode === "media" ? (
        <View style={styles.tabRow}>
          {MEDIA_TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setMediaTab(t.key)}
              style={[styles.tabChip, mediaTab === t.key && styles.tabChipActive]}
            >
              <Text style={[styles.tabText, mediaTab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {items === null ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : loadError ? (
        <View style={styles.errorBlock}>
          <Text style={styles.errorText}>Couldn't load this — check your connection.</Text>
          <Pressable onPress={load} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : mode === "media" && mediaTab === "media" ? (
        <FlatList
          key="grid"
          data={items}
          numColumns={3}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingBottom: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>Nothing here yet.</Text>}
          renderItem={({ item }) => {
            const attachment = item.attachments?.[0];
            if (!attachment) return null;
            const isVideo = item.type === "video";
            const url = resolveMediaUrl(attachment.url);
            if (!url) return null;
            return (
              <Pressable
                style={styles.tile}
                onPress={() => setViewer({ url, name: attachment.name || "media", kind: isVideo ? "video" : "image", messageId: item.id })}
              >
                <Image source={{ uri: url }} style={styles.tileImage} resizeMode="cover" />
                {isVideo ? (
                  <View style={styles.playBadge}>
                    <Ionicons name="play" size={12} color="#fff" />
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          key="list"
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Nothing here yet.</Text>}
          renderItem={({ item }) => {
            const isFiles = mode === "media" && mediaTab === "files";
            const isLinks = mode === "media" && mediaTab === "links";
            const attachment = item.attachments?.[0];
            const onPress = isFiles
              ? () => {
                  const url = attachment ? resolveMediaUrl(attachment.url) : null;
                  const fileName = attachment?.name || "file";
                  const actions: ActionSheetAction[] = [
                    { key: "locate", label: "Locate in chat", icon: "chatbubble-outline", onPress: () => jumpToChat(item.id) },
                    ...(url ? ([
                      { key: "open", label: "Open", icon: "open-outline", onPress: () => openFile(url, fileName, attachment?.mimeType) },
                      { key: "save", label: "Save to device", icon: "download-outline", onPress: () => saveFile(url, fileName, attachment?.mimeType) },
                      { key: "copy", label: "Copy link", icon: "link-outline", onPress: () => Clipboard.setStringAsync(url) },
                      {
                        key: "details",
                        label: "View details",
                        icon: "information-circle-outline",
                        onPress: () => Alert.alert(
                          fileName,
                          `Type: ${item.type}\nShared by: ${item.sender_name}\nDate: ${new Date(item.sent_at).toLocaleString()}`
                        ),
                      },
                    ] as ActionSheetAction[]) : []),
                  ];
                  setFileSheet({ name: fileName, sender: item.sender_name, actions });
                }
              : () => jumpToChat(item.id);

            return (
              <Pressable style={styles.row} onPress={onPress}>
                <Text style={styles.sender}>{item.sender_name}</Text>
                {isLinks ? (
                  (item.links ?? []).map((url, i) => (
                    <Pressable key={i} onPress={() => Linking.openURL(url)}>
                      <Text style={styles.link} numberOfLines={1}>{url}</Text>
                    </Pressable>
                  ))
                ) : isFiles ? (
                  <Text style={styles.text} numberOfLines={1}>{attachment?.name || "Attachment"}</Text>
                ) : (
                  <Text style={styles.text} numberOfLines={2}>{item.text || "Attachment"}</Text>
                )}
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        {/* A Modal is its own native window on Android — RNGH's app-level
            root doesn't reach it, so ZoomableImage's pinch/pan needs its
            own nested root here or it silently does nothing. */}
        <GestureHandlerRootView style={styles.viewerBackdrop}>
          <Pressable style={styles.viewerCloseButton} onPress={() => setViewer(null)} hitSlop={10}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Pressable
            style={styles.viewerJumpButton}
            onPress={() => { if (viewer) { setViewer(null); jumpToChat(viewer.messageId); } }}
            hitSlop={10}
          >
            <Ionicons name="return-up-back" size={22} color="#fff" />
          </Pressable>
          <Pressable
            style={styles.viewerCopyButton}
            onPress={() => viewer && Clipboard.setStringAsync(viewer.url)}
            hitSlop={10}
          >
            <Ionicons name="link-outline" size={21} color="#fff" />
          </Pressable>
          <Pressable
            style={styles.viewerDetailsButton}
            onPress={() => viewer && Alert.alert(viewer.name, `Type: ${viewer.kind}`)}
            hitSlop={10}
          >
            <Ionicons name="information-circle-outline" size={22} color="#fff" />
          </Pressable>

          {viewer?.kind === "video" ? (
            <VideoBubble uri={viewer.url} style={styles.viewerMedia} />
          ) : viewer ? (
            <ZoomableImage uri={viewer.url} style={styles.viewerMedia} />
          ) : null}

          <Pressable
            style={styles.viewerSaveButton}
            onPress={() => viewer && saveFile(viewer.url, viewer.name, viewer.kind === "video" ? "video/mp4" : "image/jpeg")}
          >
            <Text style={styles.viewerSaveText}>{viewer?.kind === "video" ? "Save video" : "Save image"}</Text>
          </Pressable>
        </GestureHandlerRootView>
      </Modal>

      <ActionSheet
        visible={!!fileSheet}
        title={fileSheet?.name ?? ""}
        subtitle={fileSheet ? `Shared by ${fileSheet.sender}` : undefined}
        actions={fileSheet?.actions ?? []}
        onClose={() => setFileSheet(null)}
      />
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { marginTop: 40 },
  tabRow: {
    flexDirection: "row",
    gap: 6,
    padding: 10,
  },
  tabChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  tabChipActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primaryText,
  },
  list: { padding: 12, gap: 8 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 24, width: "100%" },
  errorBlock: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 12 },
  errorText: { color: colors.danger, fontSize: 14, textAlign: "center" },
  retryButton: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.primary },
  retryText: { color: colors.primaryText, fontWeight: "700", fontSize: 13 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  sender: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  text: { fontSize: 14, color: colors.text, marginTop: 2 },
  link: { fontSize: 13, color: colors.primary, textDecorationLine: "underline", marginTop: 2 },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    margin: GRID_GAP / 2,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  tileImage: { width: "100%", height: "100%" },
  playBadge: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -14,
    marginLeft: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  viewerMedia: { width: "100%", height: "75%" },
  viewerCloseButton: { position: "absolute", top: 48, right: 20, zIndex: 1 },
  viewerCopyButton: { position: "absolute", top: 48, right: 64, zIndex: 1 },
  viewerDetailsButton: { position: "absolute", top: 48, right: 108, zIndex: 1 },
  viewerJumpButton: { position: "absolute", top: 48, left: 20, zIndex: 1 },
  viewerSaveButton: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  viewerSaveText: { color: "#fff", fontWeight: "600" },
});
