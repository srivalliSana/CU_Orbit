import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { getList, importListCsv, type ListFieldType } from "../../api/lists";
import { parseCsv } from "../../lib/csv";
import OptionPickerModal, { type PickerOption } from "../../components/lists/OptionPickerModal";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "ListImport">;

type ColumnMapping =
  | { mode: "new"; header: string; name: string; type: ListFieldType }
  | { mode: "existing"; header: string; fieldId: string }
  | { mode: "skip"; header: string };

const NEW_TYPE_OPTIONS: PickerOption[] = [
  { id: "text", label: "Text" },
  { id: "long_text", label: "Long text" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "checkbox", label: "Checkbox" },
  { id: "assignee", label: "Assignee" },
];

export default function ListImportScreen({ route, navigation }: Props) {
  const { listId } = route.params;
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();

  const { data } = useQuery({ queryKey: ["list", listId], queryFn: () => getList(listId) });
  const [rows, setRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [busy, setBusy] = useState(false);
  const [typePickerIndex, setTypePickerIndex] = useState<number | null>(null);
  const [fieldPickerIndex, setFieldPickerIndex] = useState<number | null>(null);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "*/*"], copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;
    try {
      const text = await new File(result.assets[0].uri).text();
      const parsed = parseCsv(text);
      if (parsed.length < 1) { Alert.alert("Empty file", "That file has no rows."); return; }
      setRows(parsed);
      const header = parsed[0];
      const fields = data?.fields || [];
      setMapping(header.map((h) => {
        const existing = fields.find((f) => f.name.toLowerCase() === h.trim().toLowerCase());
        return existing
          ? { mode: "existing", header: h, fieldId: existing.id }
          : { mode: "new", header: h, name: h.trim() || "Column", type: "text" };
      }));
    } catch {
      Alert.alert("Couldn't read that file", "Please try a different CSV file.");
    }
  };

  const submit = async () => {
    if (!rows) return;
    setBusy(true);
    try {
      const active = mapping
        .map((m, i) => ({ m, i }))
        .filter((entry): entry is { m: Exclude<ColumnMapping, { mode: "skip" }>; i: number } => entry.m.mode !== "skip");
      const columns = active.map(({ m }) =>
        m.mode === "existing" ? { fieldId: m.fieldId } : { name: m.name, type: m.type }
      );
      const dataRows = rows.slice(1).map((r) => active.map(({ i }) => r[i] ?? ""));
      const result = await importListCsv(listId, columns, dataRows);
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      Alert.alert("Imported", `Added ${result.imported} item${result.imported === 1 ? "" : "s"}.`, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert("Import failed", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!rows) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.introText}>Each row becomes an item. The first row is used as column headers.</Text>
        <Pressable onPress={pickFile} style={[styles.pickButton, { backgroundColor: colors.primary }]}>
          <Text style={styles.pickButtonText}>Choose CSV file</Text>
        </Pressable>
      </View>
    );
  }

  const fields = data?.fields || [];
  const fieldOptions: PickerOption[] = fields.map((f) => ({ id: f.id, label: f.name }));

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 90 }}>
        <Text style={styles.summary}>{rows.length - 1} row{rows.length - 1 === 1 ? "" : "s"} found. Map each column below.</Text>
        {mapping.map((m, i) => (
          <View key={i} style={[styles.columnCard, { borderColor: colors.border }]}>
            <Text style={[styles.columnHeader, { color: colors.text }]}>{m.header || `Column ${i + 1}`}</Text>
            <View style={styles.chipsRow}>
              <Pressable
                onPress={() => setMapping((prev) => prev.map((row, ri) => (ri === i ? { mode: "new", header: row.header, name: row.header || "Column", type: "text" } : row)))}
                style={[styles.chip, m.mode === "new" && { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.chipText, m.mode === "new" && { color: "#fff" }]}>
                  New field{m.mode === "new" ? ` (${NEW_TYPE_OPTIONS.find((t) => t.id === m.type)?.label})` : ""}
                </Text>
              </Pressable>
              {m.mode === "new" && (
                <Pressable onPress={() => setTypePickerIndex(i)} style={styles.chip}>
                  <Text style={styles.chipText}>Change type</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => (fields.length ? setFieldPickerIndex(i) : null)}
                style={[styles.chip, m.mode === "existing" && { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.chipText, m.mode === "existing" && { color: "#fff" }]}>
                  {m.mode === "existing" ? `Map: ${fields.find((f) => f.id === m.fieldId)?.name}` : "Map to existing…"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMapping((prev) => prev.map((row, ri) => (ri === i ? { mode: "skip", header: row.header } : row)))}
                style={[styles.chip, m.mode === "skip" && { backgroundColor: colors.danger }]}
              >
                <Text style={[styles.chipText, m.mode === "skip" && { color: "#fff" }]}>Skip</Text>
              </Pressable>
            </View>
          </View>
        ))}
        <Pressable onPress={() => setRows(null)} style={{ marginTop: 4 }}>
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>Choose a different file</Text>
        </Pressable>
      </ScrollView>

      <Pressable onPress={submit} disabled={busy} style={[styles.importButton, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
        <Text style={styles.importButtonText}>{busy ? "Importing…" : "Import"}</Text>
      </Pressable>

      {typePickerIndex !== null && (
        <OptionPickerModal
          visible
          title="Field type"
          options={NEW_TYPE_OPTIONS}
          selectedId={mapping[typePickerIndex]?.mode === "new" ? (mapping[typePickerIndex] as any).type : undefined}
          onSelect={(id) => setMapping((prev) => prev.map((row, ri) => (ri === typePickerIndex && row.mode === "new" ? { ...row, type: id as ListFieldType } : row)))}
          onClose={() => setTypePickerIndex(null)}
        />
      )}
      {fieldPickerIndex !== null && (
        <OptionPickerModal
          visible
          title="Map to field"
          options={fieldOptions}
          onSelect={(id) => setMapping((prev) => prev.map((row, ri) => (ri === fieldPickerIndex ? { mode: "existing", header: row.header, fieldId: id } : row)))}
          onClose={() => setFieldPickerIndex(null)}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  introText: { textAlign: "center", color: colors.textMuted, fontSize: 13 },
  pickButton: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  pickButtonText: { color: "#fff", fontWeight: "700" },
  summary: { fontSize: 12, color: colors.textMuted, marginBottom: 10 },
  columnCard: { borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 8 },
  columnHeader: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface },
  chipText: { fontSize: 11, fontWeight: "600", color: colors.text },
  importButton: { position: "absolute", left: 16, right: 16, bottom: 16, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  importButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
