import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { createCanvas, deleteCanvas, getCanvas, updateCanvas, type CanvasRow } from "../../api/canvas";
import { renderMessageText } from "../../lib/markdown";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "Canvas">;

/** One pinned doc per channel — mirrors web's CanvasPanel. Plain text with
 *  the same lightweight markdown chat messages already render; last-write-
 *  wins on save, no realtime collaborative editing. */
export default function CanvasScreen({ route, navigation }: Props) {
  const { channelId } = route.params;
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [canvas, setCanvas] = useState<CanvasRow | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => getCanvas(channelId).then(setCanvas).catch(() => setCanvas(null));
  useEffect(() => { load(); }, [channelId]);

  const startCreate = async () => {
    setBusy(true);
    try {
      const created = await createCanvas(channelId, { title: "Untitled canvas", body: "" });
      setCanvas(created);
      setTitleDraft(created.title);
      setBodyDraft(created.body);
      setEditing(true);
    } catch (e) {
      Alert.alert("Couldn't create canvas", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    if (!canvas) return;
    setTitleDraft(canvas.title);
    setBodyDraft(canvas.body);
    setEditing(true);
  };

  const save = async () => {
    if (!canvas) return;
    setBusy(true);
    try {
      const updated = await updateCanvas(canvas.id, { title: titleDraft, body: bodyDraft });
      setCanvas(updated);
      setEditing(false);
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    if (!canvas) return;
    Alert.alert("Delete this canvas?", "This removes it for everyone in the channel.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => { await deleteCanvas(canvas.id).catch(() => {}); setCanvas(null); },
      },
    ]);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Canvas",
      headerRight: () =>
        canvas && !editing ? (
          <Pressable onPress={startEdit} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>Edit</Text>
          </Pressable>
        ) : editing ? (
          <Pressable onPress={save} disabled={busy} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>{busy ? "…" : "Save"}</Text>
          </Pressable>
        ) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, canvas, editing, busy, titleDraft, bodyDraft]);

  if (canvas === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (canvas === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No canvas yet for this channel.</Text>
        <Text style={styles.emptySubtitle}>
          A canvas is a shared doc pinned to the channel — meeting notes, a project brief, onboarding info, anything worth keeping visible and editable by the whole channel.
        </Text>
        <Pressable onPress={startCreate} disabled={busy} style={styles.createButton}>
          <Text style={styles.createButtonText}>{busy ? "Creating…" : "Create canvas"}</Text>
        </Pressable>
      </View>
    );
  }

  if (editing) {
    return (
      <View style={styles.container}>
        <View style={{ padding: 16, gap: 12, flex: 1 }}>
          <TextInput
            value={titleDraft} onChangeText={setTitleDraft} placeholder="Title"
            placeholderTextColor={colors.textMuted} style={styles.titleInput}
          />
          <TextInput
            value={bodyDraft} onChangeText={setBodyDraft} multiline textAlignVertical="top"
            placeholder="Write anything — **bold**, _italic_, links, @mentions all render the same as in chat."
            placeholderTextColor={colors.textMuted} style={styles.bodyInput}
          />
          <Pressable onPress={confirmDelete} style={{ alignItems: "center", paddingVertical: 10 }}>
            <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 13 }}>Delete canvas</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>{canvas.title}</Text>
      {canvas.body ? (
        <Text style={styles.body}>{renderMessageText(canvas.body, styles.link, styles.mentionChip, [])}</Text>
      ) : (
        <Text style={styles.emptySubtitle}>This canvas is empty. Tap Edit to start writing.</Text>
      )}
      <Text style={styles.updated}>Last edited {new Date(canvas.updatedAt).toLocaleString()}</Text>
    </ScrollView>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10,
    backgroundColor: colors.background,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.text, textAlign: "center" },
  emptySubtitle: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 19 },
  createButton: { marginTop: 8, backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  createButtonText: { color: colors.primaryText, fontWeight: "700", fontSize: 14 },
  titleInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 17, fontWeight: "700", color: colors.text, backgroundColor: colors.surface,
  },
  bodyInput: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: colors.text, backgroundColor: colors.surface,
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, marginBottom: 12 },
  body: { fontSize: 14, lineHeight: 21, color: colors.text },
  link: { color: colors.primary, textDecorationLine: "underline" },
  mentionChip: { color: colors.primary, fontWeight: "700" },
  updated: { fontSize: 11, color: colors.textMuted, marginTop: 20 },
});
