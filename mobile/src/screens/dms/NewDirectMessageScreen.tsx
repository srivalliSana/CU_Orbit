import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { listUsers } from "../../api/users";
import { useAuthStore } from "../../state/authStore";
import Avatar from "../../components/Avatar";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "NewDirectMessage">;

export default function NewDirectMessageScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [q, setQ] = useState("");
  const selfId = useAuthStore((s) => s.user?.id);
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: listUsers });

  const people = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? [])
      .filter((u) => u.id !== selfId)
      .filter((u) => !term || (u.name || "").toLowerCase().includes(term));
  }, [data, selfId, q]);

  const openDm = (otherId: string, otherName: string) => {
    if (!selfId) return;
    // Matches server.js's dm_id convention exactly: [userId, u.id].sort().join('_').
    const containerId = [selfId, otherId].sort().join("_");
    navigation.replace("Chat", { containerId, title: otherName, kind: "dm" });
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search people"
        style={styles.search}
      />
      <FlatList
        data={people}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => openDm(item.id, item.name)}>
            <Avatar name={item.name} url={item.avatarUrl} size={40} />
            <Text style={styles.name}>{item.name}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No one found.</Text>
          </View>
        }
      />
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    color: colors.textMuted,
  },
  search: {
    margin: 12,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  name: {
    fontSize: 15,
    color: colors.text,
  },
});
