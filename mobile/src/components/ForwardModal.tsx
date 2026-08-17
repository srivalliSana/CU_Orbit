import { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import Avatar from "./Avatar";
import { getHome } from "../api/home";
import { sendMessage } from "../api/messages";
import { useThemeColors } from "../state/themeStore";
import type { Message } from "../types/api";

interface Row {
  id: string;
  kind: "channel" | "dm";
  title: string;
}

/**
 * "Forward this message to anyone" — same channel/DM list HomeScreen shows,
 * re-sending the message's text/attachment into whichever container is
 * picked with a "forwarded" label. No new message type, just a normal send.
 */
export default function ForwardModal({
  message,
  visible,
  onClose,
  onForwarded,
}: {
  message: Message | null;
  visible: boolean;
  onClose: () => void;
  onForwarded: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setRows(null);
    getHome()
      .then((data) => {
        const channels: Row[] = data.channels.map((c) => ({ id: c.id, kind: "channel", title: `# ${c.name}` }));
        const dms: Row[] = data.dms.map((d) => ({ id: d.id, kind: "dm", title: d.other_user_name }));
        setRows([...channels, ...dms]);
      })
      .catch(() => setRows([]));
  }, [visible]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.title.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const forwardTo = async (target: Row) => {
    if (!message) return;
    setBusyId(target.id);
    try {
      const media = message.attachments?.[0];
      await sendMessage({
        containerId: target.id,
        body: message.text,
        type: message.type === "text" ? "text" : message.type,
        mediaUrl: media?.url,
        mediaName: media?.name,
        mediaMimeType: media?.mimeType,
        forwardedFromName: message.sender_name,
      });
      onForwarded();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Forward message</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search channels and people"
          placeholderTextColor={colors.textMuted}
          style={styles.search}
        />
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          ListEmptyComponent={
            rows === null ? <Text style={styles.empty}>Loading…</Text> : <Text style={styles.empty}>No matches.</Text>
          }
          renderItem={({ item }) => (
            <Pressable disabled={busyId === item.id} onPress={() => forwardTo(item)} style={styles.row}>
              <Avatar name={item.title} size={36} />
              <Text style={styles.rowText}>{item.title}</Text>
              {busyId === item.id ? <Text style={styles.sending}>Sending…</Text> : null}
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  close: { fontSize: 18, color: colors.textMuted },
  search: {
    margin: 12,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  empty: { padding: 20, textAlign: "center", color: colors.textMuted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowText: { flex: 1, fontSize: 15, color: colors.text },
  sending: { fontSize: 12, color: colors.textMuted },
});
