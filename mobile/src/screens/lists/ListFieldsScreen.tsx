import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { createField, deleteField, getList, updateField, type ListField, type ListFieldType } from "../../api/lists";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "ListFields">;

const FIELD_TYPES: { id: ListFieldType; label: string; icon: string }[] = [
  { id: "text", label: "Text", icon: "✎" },
  { id: "long_text", label: "Long text", icon: "≡" },
  { id: "select", label: "Dropdown", icon: "▾" },
  { id: "status", label: "Status", icon: "◔" },
  { id: "priority", label: "Priority", icon: "!" },
  { id: "date", label: "Date", icon: "📅" },
  { id: "assignee", label: "Assignee", icon: "👤" },
  { id: "checkbox", label: "Checkbox", icon: "☑" },
  { id: "number", label: "Number", icon: "#" },
];
const OPTION_TYPES: ListFieldType[] = ["select", "status", "priority"];

export default function ListFieldsScreen({ route }: Props) {
  const { listId } = route.params;
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ListField | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["list", listId], queryFn: () => getList(listId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["list", listId] });

  const remove = useMutation({
    mutationFn: (fieldId: string) => deleteField(fieldId),
    onSuccess: invalidate,
  });

  const confirmDelete = (field: ListField) => {
    Alert.alert(`Remove "${field.name}"?`, "This deletes its data from every item.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => remove.mutate(field.id) },
    ]);
  };

  if (isLoading || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={data.fields}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 90 }}
        renderItem={({ item }) => (
          <Pressable style={[styles.row, { borderColor: colors.border }]} onPress={() => setEditing(item)}>
            <Text style={styles.rowIcon}>{FIELD_TYPES.find((t) => t.id === item.type)?.icon || "✎"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                {FIELD_TYPES.find((t) => t.id === item.type)?.label}
                {item.is_title_field ? " · title field" : ""}
              </Text>
            </View>
            {!item.is_title_field && (
              <Pressable onPress={() => confirmDelete(item)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            )}
          </Pressable>
        )}
      />
      <Pressable onPress={() => setAdding(true)} style={[styles.fab, { backgroundColor: colors.primary }]}>
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>

      {adding && (
        <FieldFormModal
          listId={listId}
          onDone={() => { setAdding(false); invalidate(); }}
          onClose={() => setAdding(false)}
        />
      )}
      {editing && (
        <FieldFormModal
          listId={listId}
          field={editing}
          onDone={() => { setEditing(null); invalidate(); }}
          onClose={() => setEditing(null)}
        />
      )}
    </View>
  );
}

function FieldFormModal({
  listId, field, onDone, onClose,
}: {
  listId: string;
  field?: ListField;
  onDone: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [name, setName] = useState(field?.name || "");
  const [type, setType] = useState<ListFieldType>(field?.type || "text");
  const [optionsText, setOptionsText] = useState((field?.options || []).map((o) => o.label).join("\n"));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const options = OPTION_TYPES.includes(type) ? optionsText.split("\n").map((s) => s.trim()).filter(Boolean) : undefined;
      if (field) {
        await updateField(field.id, { name: name.trim(), options });
      } else {
        await createField(listId, { name: name.trim(), type, options });
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.formSheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.formTitle}>{field ? "Edit field" : "Add field"}</Text>
            <Text style={styles.formLabel}>Name</Text>
            <TextInput
              autoFocus value={name} onChangeText={setName}
              style={styles.formInput}
              placeholderTextColor={colors.textMuted}
            />
            {!field && (
              <>
                <Text style={styles.formLabel}>Type</Text>
                <View style={styles.typeGrid}>
                  {FIELD_TYPES.map((t) => (
                    <Pressable
                      key={t.id}
                      onPress={() => setType(t.id)}
                      style={[styles.typeChip, type === t.id && { backgroundColor: colors.primary }]}
                    >
                      <Text style={[styles.typeChipText, type === t.id && { color: "#fff" }]}>{t.icon} {t.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            {OPTION_TYPES.includes(type) && (
              <>
                <Text style={styles.formLabel}>Options (one per line)</Text>
                <TextInput
                  multiline value={optionsText} onChangeText={setOptionsText}
                  placeholder={"To do\nIn progress\nDone"}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.formInput, { minHeight: 80, textAlignVertical: "top" }]}
                />
              </>
            )}
            <View style={styles.formActions}>
              <Pressable onPress={onClose} style={styles.formCancelButton}>
                <Text style={{ color: colors.textMuted, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submit} disabled={busy || !name.trim()} style={[styles.formSubmitButton, { backgroundColor: colors.primary, opacity: busy || !name.trim() ? 0.5 : 1 }]}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{busy ? "Saving…" : field ? "Save" : "Add field"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  rowIcon: { fontSize: 16, opacity: 0.7 },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
  fab: {
    position: "absolute", right: 18, bottom: 18, width: 52, height: 52, borderRadius: 26,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 20 },
  formSheet: { backgroundColor: colors.background, borderRadius: 16, padding: 18, maxHeight: "80%" },
  formTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 12 },
  formLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 4, marginTop: 10 },
  formInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: colors.text, backgroundColor: colors.surface,
  },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  typeChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface },
  typeChipText: { fontSize: 12, fontWeight: "600", color: colors.text },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 18 },
  formCancelButton: { paddingVertical: 10, paddingHorizontal: 6 },
  formSubmitButton: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
});
