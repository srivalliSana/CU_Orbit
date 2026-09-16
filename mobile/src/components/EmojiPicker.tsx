import { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useThemeColors } from "../state/themeStore";
import { getCustomEmojis, type CustomEmoji } from "../api/customEmojis";
import { resolveMediaUrl } from "../constants/config";

// A broad curated grid rather than a full Unicode emoji library (no new
// dependency) — plus a text input that accepts anything typed via the
// device's own emoji keyboard, so this isn't actually capped to the grid.
const EMOJI_GRID = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😜", "🤔", "😎", "🥳", "😢",
  "😭", "😡", "🤯", "😱", "🥺", "😴", "🤒", "🤗", "🙄", "😇", "🤩", "😏",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "✌️", "👌", "🤞", "👋", "🫡",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "💯", "🔥", "✨",
  "🎉", "🎊", "🎂", "🎁", "🏆", "⭐", "🚀", "💡", "📌", "✅", "❌", "⚠️",
  "👀", "🧠", "💀", "👻", "🤖", "🐱", "🐶", "🦄", "🍕", "☕", "🍺", "⚽",
];

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

export default function EmojiPicker({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [custom, setCustom] = useState("");
  const [teamEmoji, setTeamEmoji] = useState<CustomEmoji[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    getCustomEmojis().then(setTeamEmoji).catch(() => setTeamEmoji([]));
  }, [visible]);

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
            <Text style={styles.title}>React with</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.body} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <View style={styles.grid}>
              {EMOJI_GRID.map((e) => (
                <Pressable key={e} style={styles.cell} onPress={() => onPick(e)}>
                  <Text style={styles.emoji}>{e}</Text>
                </Pressable>
              ))}
            </View>
            {teamEmoji && teamEmoji.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Team emoji</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teamRow}>
                  {teamEmoji.map((e) => (
                    <Pressable key={e.id} style={styles.teamCell} onPress={() => onPick(`:${e.name}:`)}>
                      <Image source={{ uri: resolveMediaUrl(e.image_url) || e.image_url }} style={styles.teamImage} />
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}
          </ScrollView>

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
    maxHeight: 380,
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
    marginBottom: 10,
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
