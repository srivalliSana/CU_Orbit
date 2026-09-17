import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useThemeColors } from "../state/themeStore";
import { getCustomEmojis, type CustomEmoji } from "../api/customEmojis";
import { getTrendingGifs, searchGifs, type GifResult } from "../api/gifs";
import { EMOJI_SHORTCODES } from "../lib/emojiShortcodes";
import { resolveMediaUrl } from "../constants/config";

/** Team-uploaded emoji (managed from the website) — mobile can react with
 *  them but uploading new ones is web-only for now, same split as the
 *  Apps-platform admin screens. */
export function useCustomEmojiMap() {
  const [map, setMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    getCustomEmojis()
      .then((rows) => setMap(new Map(rows.map((r) => [`:${r.name}:`, resolveMediaUrl(r.image_url) || r.image_url]))))
      .catch(() => {});
  }, []);
  return map;
}

/** onPickGif is optional — MessageBubble's reaction-picker usage omits it
 *  (you can't "react" with a GIF), which hides the GIFs tab; Composer.tsx's
 *  usage passes it, sending the GIF as its own message immediately. */
export default function EmojiPicker({
  visible,
  onPick,
  onPickGif,
  onClose,
}: {
  visible: boolean;
  onPick: (emoji: string) => void;
  onPickGif?: (url: string) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<"emoji" | "gifs">("emoji");
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const [teamEmoji, setTeamEmoji] = useState<CustomEmoji[] | null>(null);
  const [gifs, setGifs] = useState<GifResult[] | null>(null);
  const [gifsLoading, setGifsLoading] = useState(false);
  const gifSeq = useRef(0);

  useEffect(() => {
    if (!visible) return;
    getCustomEmojis().then(setTeamEmoji).catch(() => setTeamEmoji([]));
  }, [visible]);

  useEffect(() => {
    if (!visible) { setTab("emoji"); setQuery(""); }
  }, [visible]);

  useEffect(() => {
    if (!visible || tab !== "gifs") return;
    const seq = ++gifSeq.current;
    setGifsLoading(true);
    const t = setTimeout(
      () => {
        (query.trim() ? searchGifs(query.trim()) : getTrendingGifs())
          .then((rows) => { if (seq === gifSeq.current) setGifs(rows); })
          .catch(() => { if (seq === gifSeq.current) setGifs([]); })
          .finally(() => { if (seq === gifSeq.current) setGifsLoading(false); });
      },
      query.trim() ? 300 : 0
    );
    return () => clearTimeout(t);
  }, [visible, tab, query]);

  const q = query.trim().toLowerCase();
  const filteredEmoji = q ? EMOJI_SHORTCODES.filter(([, name]) => name.includes(q)) : EMOJI_SHORTCODES;
  const filteredTeamEmoji = (teamEmoji || []).filter((e) => !q || e.name.toLowerCase().includes(q));

  const submitCustom = () => {
    const emoji = custom.trim();
    if (!emoji) return;
    onPick(emoji);
    setCustom("");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            {onPickGif ? (
              <View style={styles.tabRow}>
                {(["emoji", "gifs"] as const).map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => { setTab(key); setQuery(""); }}
                    style={[styles.tabButton, tab === key && styles.tabButtonActive]}
                  >
                    <Text style={[styles.tabButtonText, tab === key && styles.tabButtonTextActive]}>
                      {key === "emoji" ? "Emoji" : "GIFs"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.title}>React with</Text>
            )}
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tab === "gifs" ? "Search GIFs…" : "Search emoji…"}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />

          {tab === "gifs" ? (
            <FlatList
              data={gifs || []}
              key={tab}
              numColumns={2}
              style={styles.body}
              columnWrapperStyle={{ gap: 6 }}
              ListEmptyComponent={
                <Text style={styles.muted}>{gifsLoading ? "Loading…" : "No GIFs found."}</Text>
              }
              renderItem={({ item }) => (
                <Pressable style={styles.gifCell} onPress={() => onPickGif?.(item.url)}>
                  <Image source={{ uri: item.preview_url }} style={styles.gifImage} resizeMode="cover" />
                </Pressable>
              )}
              keyExtractor={(item) => item.id}
            />
          ) : (
            <ScrollView style={styles.body} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              <View style={styles.grid}>
                {filteredEmoji.map(([emoji, name]) => (
                  <Pressable key={name} style={styles.cell} onPress={() => onPick(emoji)}>
                    <Text style={styles.emoji}>{emoji}</Text>
                  </Pressable>
                ))}
                {q && filteredEmoji.length === 0 ? <Text style={styles.muted}>No emoji match "{query}".</Text> : null}
              </View>
              {filteredTeamEmoji.length > 0 ? (
                <>
                  <Text style={styles.sectionLabel}>Team emoji</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teamRow}>
                    {filteredTeamEmoji.map((e) => (
                      <Pressable key={e.id} style={styles.teamCell} onPress={() => onPick(`:${e.name}:`)}>
                        <Image source={{ uri: resolveMediaUrl(e.image_url) || e.image_url }} style={styles.teamImage} />
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              ) : null}
            </ScrollView>
          )}

          {tab === "emoji" ? (
            <View style={styles.customRow}>
              <TextInput
                value={custom}
                onChangeText={setCustom}
                placeholder="Or type/paste any emoji"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <Pressable onPress={submitCustom} disabled={!custom.trim()} style={styles.reactButton}>
                <Text style={styles.reactButtonText}>React</Text>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 320,
    maxHeight: 420,
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
  },
  body: {
    flexGrow: 0,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  close: {
    fontSize: 16,
    color: colors.textMuted,
  },
  tabRow: {
    flexDirection: "row",
    gap: 2,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 2,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: colors.background,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  tabButtonTextActive: {
    color: colors.primary,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: colors.text,
    marginBottom: 8,
  },
  muted: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: 16,
    width: "100%",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: "16.66%",
    paddingVertical: 6,
    alignItems: "center",
  },
  emoji: {
    fontSize: 22,
  },
  gifCell: {
    flex: 1,
    aspectRatio: 1.3,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.surface,
    marginBottom: 6,
  },
  gifImage: {
    width: "100%",
    height: "100%",
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: colors.textMuted,
    marginTop: 8,
    marginBottom: 4,
  },
  teamRow: {
    flexDirection: "row",
  },
  teamCell: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  teamImage: {
    width: 24,
    height: 24,
    resizeMode: "contain",
  },
  customRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
  },
  reactButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  reactButtonText: {
    color: colors.primaryText,
    fontWeight: "600",
    fontSize: 12,
  },
});
