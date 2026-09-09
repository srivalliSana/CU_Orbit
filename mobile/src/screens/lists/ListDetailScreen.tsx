import { useLayoutEffect, useMemo } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { createItem, deleteList, exportListCsvText, getList, type ListField, type ListItemRow } from "../../api/lists";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "ListDetail">;

/** One field:value preview line on an item card. */
function fieldPreview(field: ListField, item: ListItemRow): string | null {
  const raw = item.values?.[field.id];
  if (raw === undefined || raw === null || raw === "") return null;
  if (field.type === "checkbox") return raw ? "✓" : null;
  if (["select", "status", "priority"].includes(field.type)) {
    return field.options.find((o) => o.id === raw)?.label ?? null;
  }
  return String(raw);
}

export default function ListDetailScreen({ route, navigation }: Props) {
  const { listId, listName } = route.params;
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["list", listId],
    queryFn: () => getList(listId),
  });

  const addItem = useMutation({
    mutationFn: () => createItem(listId, {}),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      navigation.navigate("ListItem", { listId, itemId: item.id });
    },
  });

  const removeList = useMutation({
    mutationFn: () => deleteList(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      navigation.goBack();
    },
  });

  const exportCsv = async () => {
    try {
      const csv = await exportListCsvText(listId);
      const filename = `${(data?.list.name || "list").replace(/[^a-z0-9-_]+/gi, "_")}.csv`;
      const file = new File(Paths.cache, filename);
      file.create({ overwrite: true });
      file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: `Export ${filename}` });
    } catch (e) {
      Alert.alert("Export failed", e instanceof Error ? e.message : "Please try again.");
    }
  };

  const openMenu = () => {
    Alert.alert(
      data?.list.name || "List",
      undefined,
      [
        { text: "Manage fields", onPress: () => navigation.navigate("ListFields", { listId }) },
        { text: "Import CSV", onPress: () => navigation.navigate("ListImport", { listId }) },
        { text: "Export CSV", onPress: exportCsv },
        {
          text: "Delete list", style: "destructive",
          onPress: () => Alert.alert("Delete this list?", "This removes every item in it.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => removeList.mutate() },
          ]),
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: data?.list ? `${data.list.icon} ${data.list.name}` : listName || "List",
      headerRight: () => (
        <Pressable onPress={openMenu} hitSlop={8}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.primary} />
        </Pressable>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, data?.list.name, data?.list.icon]);

  if (isLoading || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const { fields, items } = data;
  const titleField = fields.find((f) => f.is_title_field) || fields[0];
  const previewFields = fields.filter((f) => f.id !== titleField?.id).slice(0, 3);
  const topLevelItems = items.filter((it) => !it.parent_item_id);
  const subtaskCount = (parentId: string) => items.filter((it) => it.parent_item_id === parentId).length;

  return (
    <View style={styles.container}>
      <FlatList
        data={topLevelItems}
        keyExtractor={(it) => it.id}
        refreshing={isRefetching}
        onRefresh={refetch}
        contentContainerStyle={{ padding: 12, paddingBottom: 90 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>No items yet.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const title = titleField ? fieldPreview(titleField, item) : null;
          const subtasks = subtaskCount(item.id);
          return (
            <Pressable
              style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => navigation.navigate("ListItem", { listId, itemId: item.id })}
            >
              <View style={styles.cardTitleRow}>
                <Text style={[styles.cardTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                  {title || "Untitled"}
                </Text>
                {subtasks > 0 && (
                  <Text style={[styles.subtaskBadge, { color: colors.textMuted }]}>☑ {subtasks}</Text>
                )}
                {!!item.comment_count && (
                  <Text style={[styles.subtaskBadge, { color: colors.textMuted }]}>💬 {item.comment_count}</Text>
                )}
              </View>
              {previewFields.length > 0 && (
                <View style={styles.previewRow}>
                  {previewFields.map((f) => {
                    const v = fieldPreview(f, item);
                    if (!v) return null;
                    const opt = ["select", "status", "priority"].includes(f.type)
                      ? f.options.find((o) => o.id === item.values?.[f.id])
                      : null;
                    return (
                      <View
                        key={f.id}
                        style={[styles.previewChip, opt ? { backgroundColor: `${opt.color}22` } : { backgroundColor: colors.background }]}
                      >
                        <Text style={[styles.previewChipText, opt ? { color: opt.color } : { color: colors.textMuted }]} numberOfLines={1}>
                          {v}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </Pressable>
          );
        }}
      />
      <Pressable
        onPress={() => addItem.mutate()}
        disabled={addItem.isPending}
        style={[styles.fab, { backgroundColor: colors.primary }]}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  subtaskBadge: { fontSize: 11, fontWeight: "600" },
  previewRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  previewChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 160 },
  previewChipText: { fontSize: 11, fontWeight: "600" },
  fab: {
    position: "absolute", right: 18, bottom: 18, width: 52, height: 52, borderRadius: 26,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
});
