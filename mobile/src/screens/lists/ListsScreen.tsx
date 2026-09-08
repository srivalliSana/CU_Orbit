import { useLayoutEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { createList, getLists } from "../../api/lists";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "Lists">;

/** Task/project lists shared with one channel — mirrors web's ListsPanel
 *  "list of lists" screen. Phase 1: create + open; kanban/subtasks/threads
 *  are later phases. */
export default function ListsScreen({ route, navigation }: Props) {
  const { channelId, channelName } = route.params;
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: channelName ? `Lists — ${channelName}` : "Lists" });
  }, [navigation, channelName]);

  const { data: lists, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["lists", channelId],
    queryFn: () => getLists(channelId),
  });

  const create = useMutation({
    mutationFn: () => createList(channelId, { name: name.trim() }),
    onSuccess: (list) => {
      setName("");
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["lists", channelId] });
      navigation.navigate("ListDetail", { listId: list.id, listName: list.name });
    },
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {creating ? (
        <View style={styles.createRow}>
          <TextInput
            autoFocus value={name} onChangeText={setName} placeholder="List name, e.g. Bug tracker"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            onSubmitEditing={() => name.trim() && create.mutate()}
          />
          <Pressable
            onPress={() => (name.trim() ? create.mutate() : setCreating(false))}
            style={[styles.createButton, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.createButtonText}>{create.isPending ? "…" : name.trim() ? "Create" : "Cancel"}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setCreating(true)} style={[styles.newListRow, { borderColor: colors.border }]}>
          <Ionicons name="add-circle" size={20} color={colors.primary} />
          <Text style={[styles.newListText, { color: colors.primary }]}>New list</Text>
        </Pressable>
      )}

      <FlatList
        data={lists}
        keyExtractor={(l) => l.id}
        refreshing={isRefetching}
        onRefresh={refetch}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>No lists yet in this channel.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, { borderColor: colors.border }]}
            onPress={() => navigation.navigate("ListDetail", { listId: item.id, listName: item.name })}
          >
            <Text style={styles.rowIcon}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                {item.item_count} item{item.item_count === 1 ? "" : "s"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      />
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  createRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  createButton: { borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
  createButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  newListRow: {
    flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderStyle: "dashed",
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12,
  },
  newListText: { fontWeight: "700", fontSize: 14 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12,
    padding: 12, marginBottom: 8,
  },
  rowIcon: { fontSize: 22 },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
});
