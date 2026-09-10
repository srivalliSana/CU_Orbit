import { useEffect, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { getLinkPreview, type LinkPreview } from "../api/links";
import { useThemeColors } from "../state/themeStore";

const URL_RE = /(https?:\/\/[^\s]+)/;

/** Same idea as the web version — unfurl the first link in a message body
 *  into a preview card. Fetches lazily, fails silently. */
export default function LinkPreviewCard({ text }: { text?: string }) {
  const colors = useThemeColors();
  const url = text?.match(URL_RE)?.[1];
  const [preview, setPreview] = useState<Partial<LinkPreview> | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    getLinkPreview(url)
      .then((data) => { if (!cancelled && data?.title) setPreview(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url]);

  if (!preview) return null;

  return (
    <Pressable
      onPress={() => preview.url && Linking.openURL(preview.url)}
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}
    >
      {preview.image ? <Image source={{ uri: preview.image }} style={styles.image} /> : null}
      <View style={styles.textBlock}>
        <Text style={[styles.site, { color: colors.textMuted }]} numberOfLines={1}>{preview.site_name}</Text>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{preview.title}</Text>
        {preview.description ? (
          <Text style={[styles.description, { color: colors.textMuted }]} numberOfLines={2}>{preview.description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", borderWidth: 1, borderRadius: 10, overflow: "hidden",
    marginTop: 4, maxWidth: 280,
  },
  image: { width: 64, height: 64 },
  textBlock: { flex: 1, paddingHorizontal: 8, paddingVertical: 6, justifyContent: "center", gap: 1 },
  site: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  title: { fontSize: 12, fontWeight: "700" },
  description: { fontSize: 11 },
});
