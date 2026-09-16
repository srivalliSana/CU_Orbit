import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  createWorkflow,
  deleteWorkflow,
  getWorkflows,
  updateWorkflow,
  type WorkflowActionType,
  type WorkflowRow,
  type WorkflowTriggerType,
} from "../../api/workflows";
import { getLists, type ListSummary } from "../../api/lists";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "Workflows">;

const TRIGGER_LABELS: Record<WorkflowTriggerType, string> = {
  message_contains: "A message contains a keyword",
  member_joined: "Someone joins this channel",
  schedule: "On a schedule",
};
const ACTION_LABELS: Record<WorkflowActionType, string> = {
  post_message: "Post a message",
  add_list_item: "Add an item to a list",
};
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function triggerSummary(w: WorkflowRow) {
  if (w.trigger_type === "message_contains") return `contains "${w.trigger_config?.keyword || ""}"`;
  if (w.trigger_type === "member_joined") return "someone joins";
  const h = String(w.trigger_config?.hour ?? 0).padStart(2, "0");
  const m = String(w.trigger_config?.minute ?? 0).padStart(2, "0");
  const days = w.trigger_config?.days?.length ? w.trigger_config.days.map((d) => DAY_LABELS[d]).join(",") : "every day";
  return `${h}:${m} (${days})`;
}

/** Genuinely no-code automation — one trigger + one action per workflow,
 *  mirrors web's WorkflowsPanel.jsx (same endpoints, same trigger/action
 *  vocabulary). Reached from ChannelInfoScreen's nav rows, same as Canvas. */
export default function WorkflowsScreen({ route, navigation }: Props) {
  const { channelId } = route.params;
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [workflows, setWorkflows] = useState<WorkflowRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => getWorkflows(channelId).then(setWorkflows).catch((e) => setError(e instanceof Error ? e.message : "Could not load workflows."));
  useEffect(() => { load(); }, [channelId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Workflows",
      headerRight: () => (
        <Pressable onPress={() => setCreating(true)} hitSlop={8}>
          <Text style={{ color: colors.primary, fontWeight: "700" }}>+ New</Text>
        </Pressable>
      ),
    });
  }, [navigation, colors]);

  const toggleActive = async (w: WorkflowRow) => {
    await updateWorkflow(w.id, { is_active: !w.is_active }).catch(() => {});
    load();
  };

  const remove = (w: WorkflowRow) => {
    Alert.alert(`Delete "${w.name}"?`, undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteWorkflow(w.id).catch(() => {}); load(); } },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.intro}>Automate this channel: when something happens, do something — no code required.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!workflows && !error ? <Text style={styles.muted}>Loading…</Text> : null}
        {workflows?.length === 0 ? <Text style={styles.muted}>No workflows yet in this channel.</Text> : null}

        {workflows?.map((w) => (
          <View key={w.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{w.name}</Text>
              <Text style={styles.rowSubtitle} numberOfLines={2}>
                When {TRIGGER_LABELS[w.trigger_type]?.toLowerCase()} ({triggerSummary(w)}) → {ACTION_LABELS[w.action_type]?.toLowerCase()}
              </Text>
            </View>
            <Switch value={w.is_active} onValueChange={() => toggleActive(w)} />
            <Pressable onPress={() => remove(w)} hitSlop={8}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <WorkflowFormModal
        visible={creating}
        channelId={channelId}
        onCreated={() => { setCreating(false); load(); }}
        onClose={() => setCreating(false)}
      />
    </View>
  );
}

function Chip({ label, active, onPress, styles }: { label: string; active: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function WorkflowFormModal({
  visible,
  channelId,
  onCreated,
  onClose,
}: {
  visible: boolean;
  channelId: string;
  onCreated: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>("message_contains");
  const [keyword, setKeyword] = useState("");
  const [hour, setHour] = useState("9");
  const [minute, setMinute] = useState("0");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [actionType, setActionType] = useState<WorkflowActionType>("post_message");
  const [actionBody, setActionBody] = useState("");
  const [listId, setListId] = useState("");
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    getLists(channelId).then(setLists).catch(() => setLists([]));
  }, [visible, channelId]);

  const toggleDay = (d: number) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const reset = () => {
    setName("");
    setTriggerType("message_contains");
    setKeyword("");
    setHour("9");
    setMinute("0");
    setDays([1, 2, 3, 4, 5]);
    setActionType("post_message");
    setActionBody("");
    setListId("");
    setError(null);
  };

  const submit = async () => {
    if (!name.trim()) { setError("Give the workflow a name."); return; }
    if (triggerType === "message_contains" && !keyword.trim()) { setError("Enter a keyword to watch for."); return; }
    if (actionType === "add_list_item" && !listId) { setError("Pick a list."); return; }
    if (!actionBody.trim()) { setError("Enter what the action should do."); return; }
    setBusy(true);
    setError(null);
    try {
      const trigger_config =
        triggerType === "message_contains" ? { keyword: keyword.trim() }
        : triggerType === "schedule" ? { hour: Number(hour) || 0, minute: Number(minute) || 0, days }
        : {};
      const action_config = actionType === "post_message" ? { body: actionBody } : { list_id: listId, body: actionBody };
      await createWorkflow(channelId, { name: name.trim(), trigger_type: triggerType, trigger_config, action_type: actionType, action_config });
      reset();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the workflow.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <Text style={styles.title}>New workflow</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Name</Text>
            <TextInput
              autoFocus value={name} onChangeText={setName} placeholder="e.g. Welcome new members"
              placeholderTextColor={colors.textMuted} style={styles.input}
            />

            <Text style={styles.label}>When…</Text>
            <View style={styles.chipRow}>
              {(Object.entries(TRIGGER_LABELS) as [WorkflowTriggerType, string][]).map(([id, label]) => (
                <Chip key={id} label={label} active={triggerType === id} onPress={() => setTriggerType(id)} styles={styles} />
              ))}
            </View>
            {triggerType === "message_contains" ? (
              <TextInput
                value={keyword} onChangeText={setKeyword} placeholder="keyword, e.g. help"
                placeholderTextColor={colors.textMuted} style={styles.input}
              />
            ) : null}
            {triggerType === "schedule" ? (
              <View>
                <View style={styles.timeRow}>
                  <TextInput
                    value={hour} onChangeText={setHour} keyboardType="number-pad" maxLength={2}
                    style={[styles.input, styles.timeInput]}
                  />
                  <Text style={styles.timeColon}>:</Text>
                  <TextInput
                    value={minute} onChangeText={setMinute} keyboardType="number-pad" maxLength={2}
                    style={[styles.input, styles.timeInput]}
                  />
                  <Text style={styles.muted}>server time</Text>
                </View>
                <View style={styles.chipRow}>
                  {DAY_LABELS.map((label, i) => (
                    <Chip key={label} label={label} active={days.includes(i)} onPress={() => toggleDay(i)} styles={styles} />
                  ))}
                </View>
              </View>
            ) : null}

            <Text style={styles.label}>Then…</Text>
            <View style={styles.chipRow}>
              {(Object.entries(ACTION_LABELS) as [WorkflowActionType, string][]).map(([id, label]) => (
                <Chip key={id} label={label} active={actionType === id} onPress={() => setActionType(id)} styles={styles} />
              ))}
            </View>
            {actionType === "add_list_item" ? (
              <View style={styles.chipRow}>
                {lists.length === 0 ? <Text style={styles.muted}>No lists in this channel yet.</Text> : null}
                {lists.map((l) => (
                  <Chip key={l.id} label={`${l.icon} ${l.name}`} active={listId === l.id} onPress={() => setListId(l.id)} styles={styles} />
                ))}
              </View>
            ) : null}
            <TextInput
              value={actionBody} onChangeText={setActionBody} multiline
              placeholder={
                actionType === "post_message"
                  ? "Message text — use {{user}} for the triggering person's name"
                  : "Item title — use {{user}} for the triggering person's name"
              }
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.bodyInput]}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable onPress={submit} disabled={busy} style={[styles.submitButton, busy && styles.submitButtonDisabled]}>
              <Text style={styles.submitButtonText}>{busy ? "Creating…" : "Create workflow"}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  intro: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  muted: { fontSize: 13, color: colors.textMuted },
  error: { fontSize: 13, color: colors.danger, marginBottom: 8 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 12,
    padding: 12, marginBottom: 8,
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  rowSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  deleteText: { fontSize: 12, fontWeight: "700", color: colors.danger },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { maxHeight: "85%", backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 15, fontWeight: "700", color: colors.text },
  close: { fontSize: 16, color: colors.textMuted },
  label: { fontSize: 11, fontWeight: "600", color: colors.textMuted, marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: colors.text, marginBottom: 8,
  },
  bodyInput: { minHeight: 70, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  chip: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  chipTextActive: { color: colors.primaryText },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  timeInput: { width: 56, marginBottom: 0, textAlign: "center" },
  timeColon: { fontSize: 14, color: colors.textMuted },
  submitButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 4 },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: colors.primaryText, fontWeight: "700", fontSize: 14 },
});
