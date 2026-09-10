import { useLayoutEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { createItem, getList, updateItem, type ListField, type ListItemRow } from "../../api/lists";
import OptionPickerModal from "../../components/lists/OptionPickerModal";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "ListBoard">;

const GROUPABLE_TYPES = ["select", "status", "priority"];
const NO_VALUE = "__none__";

/** Kanban board, mobile version — no native drag library installed, so
 *  moving a card between columns is tap-to-pick (a "Move to" sheet) rather
 *  than drag-and-drop. Same grouping concept as web's BoardView: columns
 *  are one field's options plus a "no value" catch-all. Horizontally
 *  scrollable columns, Trello-mobile style, since side-by-side columns
 *  don't fit a phone width the way they do a desktop window. */
export default function ListBoardScreen({ route, navigation }: Props) {
  const { listId, listName } = route.params;
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [groupFieldId, setGroupFieldId] = useState<string | null>(null);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [movingItem, setMovingItem] = useState<ListItemRow | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["list", listId], queryFn: () => getList(listId) });

  const setValue = useMutation({
    mutationFn: (vars: { itemId: string; fieldId: string; value: string | undefined }) =>
      updateItem(vars.itemId, { [vars.fieldId]: vars.value }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["list", listId] });
      queryClient.setQueryData<typeof data>(["list", listId], (prev) =>
        prev
          ? { ...prev, items: prev.items.map((it) => (it.id === vars.itemId ? { ...it, values: { ...it.values, [vars.fieldId]: vars.value } } : it)) }
          : prev
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["list", listId] }),
  });

  const addToColumn = useMutation({
    mutationFn: (vars: { fieldId: string; value: string | undefined }) => createItem(listId, { [vars.fieldId]: vars.value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["list", listId] }),
  });

  useLayoutEffect(() => {
    navigation.setOptions({ title: data?.list ? `${data.list.icon} ${data.list.name}` : listName || "Board" });
  }, [navigation, data?.list.name, data?.list.icon, listName]);

  if (isLoading || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const { fields, items } = data;
  const groupableFields = fields.filter((f) => GROUPABLE_TYPES.includes(f.type));
  const groupField = groupableFields.find((f) => f.id === groupFieldId) || groupableFields[0];
  const titleField = fields.find((f) => f.is_title_field) || fields[0];
  const topLevelItems = items.filter((it) => !it.parent_item_id);

  if (!groupField) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center", paddingHorizontal: 24 }}>
          Board view groups items by a Status, Priority, or Dropdown field. Add one from Manage fields first.
        </Text>
      </View>
    );
  }

  const columns: { id: string; label: string; color: string }[] = [
    ...groupField.options,
    { id: NO_VALUE, label: `No ${groupField.name}`, color: colors.textMuted },
  ];

  const moveTo = (columnId: string) => {
    if (!movingItem) return;
    setValue.mutate({ itemId: movingItem.id, fieldId: groupField.id, value: columnId === NO_VALUE ? undefined : columnId });
    setMovingItem(null);
  };

  return (
    <View style={styles.container}>
      {groupableFields.length > 1 && (
        <Pressable onPress={() => setFieldPickerOpen(true)} style={styles.groupByRow}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Group by</Text>
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{groupField.name}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.primary} />
        </Pressable>
      )}

      <ScrollView horizontal contentContainerStyle={styles.board} showsHorizontalScrollIndicator={false}>
        {columns.map((col) => {
          const colItems = topLevelItems.filter((it) => (it.values?.[groupField.id] ?? NO_VALUE) === col.id);
          return (
            <View key={col.id} style={[styles.column, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.columnHeader}>
                <View style={[styles.dot, { backgroundColor: col.color }]} />
                <Text style={[styles.columnTitle, { color: colors.text }]} numberOfLines={1}>{col.label}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{colItems.length}</Text>
              </View>
              <ScrollView style={{ flex: 1 }}>
                {colItems.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => navigation.navigate("ListItem", { listId, itemId: item.id })}
                    onLongPress={() => setMovingItem(item)}
                    style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}
                  >
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }} numberOfLines={2}>
                      {(titleField && (item.values?.[titleField.id] as string)) || "Untitled"}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => addToColumn.mutate({ fieldId: groupField.id, value: col.id === NO_VALUE ? undefined : col.id })}
                  style={styles.addRow}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>+ Add item</Text>
                </Pressable>
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>

      <OptionPickerModal
        visible={fieldPickerOpen}
        title="Group by"
        options={groupableFields.map((f) => ({ id: f.id, label: f.name }))}
        selectedId={groupField.id}
        onSelect={(id) => setGroupFieldId(id)}
        onClose={() => setFieldPickerOpen(false)}
      />

      <OptionPickerModal
        visible={!!movingItem}
        title="Move to"
        options={columns}
        selectedId={movingItem ? ((movingItem.values?.[groupField.id] as string) ?? NO_VALUE) : undefined}
        onSelect={moveTo}
        onClose={() => setMovingItem(null)}
      />
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  groupByRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  board: { padding: 10, gap: 10, flexDirection: "row" },
  column: { width: 240, borderWidth: 1, borderRadius: 12, maxHeight: "100%" },
  columnHeader: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  columnTitle: { flex: 1, fontSize: 13, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 10, padding: 10, marginHorizontal: 8, marginBottom: 8 },
  addRow: { paddingHorizontal: 16, paddingVertical: 10 },
});
