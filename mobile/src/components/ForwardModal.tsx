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
 * "Forward this message to anyone" — same channel/DM list HomeScreen shows.
 * Picking a target only selects it (checkmark); nothing sends until the
 * Send button is pressed, so a stray tap can't fire off a message.
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setRows(null);
    setSelected(new Set());
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

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const send = async () => {
    if (!message || !rows) return;
    setSending(true);
    try {
      const media = message.attachments?.[0];
      const targets = rows.filter((r) => selected.has(r.id));
      await Promise.all(targets.map((target) => sendMessage({
        containerId: target.id,
        body: message.text,
        type: message.type === "text" ? "text" : message.type,
        mediaUrl: media?.url,
        mediaName: media?.name,
        mediaMimeType: media?.mimeType,
        forwardedFromName: message.sender_name,
      })));
      onForwarded();
    } finally {
      setSending(false);
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
            <Pressable onPress={() => toggle(item.id)} style={[styles.row, selected.has(item.id) && styles.rowSelected]}>
              <Avatar name={item.title} size={36} />
              <Text style={styles.rowText}>{item.title}</Text>
              <View style={[styles.checkbox, selected.has(item.id) && styles.checkboxChecked]}>
                {selected.has(item.id) ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
            </Pressable>
          )}
        />
        <View style={styles.footer}>
          <Pressable
            disabled={selected.size === 0 || sending}
            onPress={send}
            style={[styles.sendButton, (selected.size === 0 || sending) && styles.sendButtonDisabled]}
          >
            <Text style={styles.sendButtonText}>
              {sending ? "Sending…" : selected.size > 0 ? `Send to ${selected.size}` : "Select where to send"}
            </Text>
          </Pressable>
        </View>
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
  rowSelected: {
    backgroundColor: colors.surface,
  },
  rowText: { flex: 1, fontSize: 15, color: colors.text },
  sending: { fontSize: 12, color: colors.textMuted },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkmark: { color: colors.primaryText, fontSize: 12, fontWeight: "700" },
  footer: {
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: colors.primaryText,
    fontWeight: "600",
    fontSize: 15,
  },
});
