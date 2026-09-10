import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { addMessageToList, createList, getLists, type ListSummary } from "../../api/lists";
import { useThemeColors } from "../../state/themeStore";

/** "Convert to list item" — mobile version of web's AddToListModal. Pick an
 *  existing list in this channel, or create one on the spot; the message's
 *  text becomes the new item's title field. */
export default function AddToListSheet({
  visible, channelId, messageId, messageText, onClose,
}: {
  visible: boolean;
  channelId: string;
  messageId: string;
  messageText?: string;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLists(null);
    setCreating(false);
    setName("");
    getLists(channelId).then(setLists).catch(() => setLists([]));
  }, [visible, channelId]);

  const addTo = async (listId: string) => {
    setBusy(true);
    try {
      await addMessageToList(listId, messageId);
      onClose();
    } catch (e) {
      Alert.alert("Couldn't add to that list", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const createAndAdd = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const list = await createList(channelId, { name: name.trim() });
      await addMessageToList(list.id, messageId);
      onClose();
    } catch (e) {
      Alert.alert("Couldn't create the list", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Add to list</Text>
          <Text style={styles.preview} numberOfLines={1}>{messageText || "Attachment"}</Text>

          {!lists ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
          ) : (
            <ScrollView style={{ maxHeight: 220 }}>
              {lists.length === 0 && !creating && (
                <Text style={{ color: colors.textMuted, fontSize: 13, paddingVertical: 8 }}>No lists in this channel yet.</Text>
              )}
              {lists.map((l) => (
                <Pressable key={l.id} disabled={busy} onPress={() => addTo(l.id)} style={styles.row}>
                  <Text style={{ fontSize: 16 }}>{l.icon}</Text>
                  <Text style={{ color: colors.text, fontSize: 15, flex: 1 }} numberOfLines={1}>{l.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {creating ? (
            <View style={styles.createRow}>
              <TextInput
                autoFocus value={name} onChangeText={setName} onSubmitEditing={createAndAdd}
                placeholder="New list name" placeholderTextColor={colors.textMuted}
                style={[styles.input, { flex: 1 }]}
              />
              <Pressable onPress={createAndAdd} disabled={busy}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>{busy ? "…" : "Create"}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setCreating(true)} style={{ paddingVertical: 10 }}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>+ New list</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  sheet: { backgroundColor: colors.background, borderRadius: 16, padding: 16, width: "88%" },
  title: { fontSize: 15, fontWeight: "700", color: colors.text },
  preview: { fontSize: 12, color: colors.textMuted, marginTop: 2, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  createRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 14, color: colors.text, backgroundColor: colors.surface,
  },
});
