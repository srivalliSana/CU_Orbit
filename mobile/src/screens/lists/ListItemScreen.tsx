import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { deleteItem, getList, updateItem, type ListDetail, type ListField } from "../../api/lists";
import OptionPickerModal from "../../components/lists/OptionPickerModal";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "ListItem">;

const TYPE_ICON: Record<string, string> = {
  text: "✎", long_text: "≡", select: "▾", status: "◔", priority: "!",
  date: "📅", assignee: "👤", checkbox: "☑", number: "#",
};

export default function ListItemScreen({ route, navigation }: Props) {
  const { listId, itemId } = route.params;
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [pickerField, setPickerField] = useState<ListField | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["list", listId], queryFn: () => getList(listId) });
  const item = data?.items.find((it) => it.id === itemId);

  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) => updateItem(itemId, values),
    onMutate: async (values) => {
      await queryClient.cancelQueries({ queryKey: ["list", listId] });
      queryClient.setQueryData<ListDetail>(["list", listId], (prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                it.id === itemId ? { ...it, values: { ...it.values, ...values } as ListDetail["items"][number]["values"] } : it
              ),
            }
          : prev
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["list", listId] }),
  });

  const remove = useMutation({
    mutationFn: () => deleteItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      navigation.goBack();
    },
  });

  const confirmDelete = () => {
    Alert.alert("Delete this item?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate() },
    ]);
  };

  if (isLoading || !data || !item) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const { fields } = data;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 16 }}>
      {fields.map((field) => (
        <FieldRow
          key={field.id}
          field={field}
          value={item.values?.[field.id]}
          onChange={(v) => save.mutate({ [field.id]: v })}
          onOpenPicker={() => setPickerField(field)}
          styles={styles}
        />
      ))}

      <Pressable onPress={confirmDelete} style={styles.deleteButton}>
        <Text style={styles.deleteText}>Delete item</Text>
      </Pressable>

      {pickerField && (
        <OptionPickerModal
          visible
          title={pickerField.name}
          options={pickerField.options}
          selectedId={item.values?.[pickerField.id] as string | undefined}
          allowClear
          onSelect={(id) => save.mutate({ [pickerField.id]: id || undefined })}
          onClose={() => setPickerField(null)}
        />
      )}
    </ScrollView>
  );
}

function FieldRow({
  field, value, onChange, onOpenPicker, styles,
}: {
  field: ListField;
  value: string | number | boolean | undefined;
  onChange: (v: unknown) => void;
  onOpenPicker: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [draft, setDraft] = useState(value !== undefined && value !== null ? String(value) : "");

  const label = (
    <Text style={styles.fieldLabel}>
      {TYPE_ICON[field.type] || "✎"} {field.name}
    </Text>
  );

  if (field.type === "checkbox") {
    return (
      <View style={styles.fieldBlock}>
        <View style={styles.checkboxRow}>
          {label}
          <Switch value={!!value} onValueChange={onChange} />
        </View>
      </View>
    );
  }

  if (["select", "status", "priority"].includes(field.type)) {
    const opt = field.options.find((o) => o.id === value);
    return (
      <View style={styles.fieldBlock}>
        {label}
        <Pressable onPress={onOpenPicker} style={styles.pickerButton}>
          {opt ? (
            <View style={[styles.chip, { backgroundColor: `${opt.color}22` }]}>
              <Text style={[styles.chipText, { color: opt.color }]}>{opt.label}</Text>
            </View>
          ) : (
            <Text style={styles.placeholder}>Choose…</Text>
          )}
        </Pressable>
      </View>
    );
  }

  if (field.type === "long_text") {
    return (
      <View style={styles.fieldBlock}>
        {label}
        <TextInput
          multiline value={draft} onChangeText={setDraft} onBlur={() => onChange(draft)}
          style={[styles.input, styles.multilineInput]}
        />
      </View>
    );
  }

  return (
    <View style={styles.fieldBlock}>
      {label}
      <TextInput
        value={draft} onChangeText={setDraft} onBlur={() => onChange(draft)}
        keyboardType={field.type === "number" ? "numeric" : "default"}
        placeholder={field.type === "date" ? "YYYY-MM-DD" : field.type === "assignee" ? "name or email" : undefined}
        placeholderTextColor={styles.placeholder.color as string}
        style={styles.input}
      />
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  fieldBlock: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  checkboxRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: colors.text, backgroundColor: colors.surface,
  },
  multilineInput: { minHeight: 80, textAlignVertical: "top" },
  pickerButton: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.surface, alignItems: "flex-start",
  },
  chip: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 13, fontWeight: "700" },
  placeholder: { color: colors.textMuted, fontSize: 14 },
  deleteButton: { alignItems: "center", paddingVertical: 14, marginTop: 8 },
  deleteText: { color: colors.danger, fontWeight: "700", fontSize: 14 },
});
