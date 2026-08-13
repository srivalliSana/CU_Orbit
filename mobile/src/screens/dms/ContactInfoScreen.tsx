import { useMemo } from "react";
import { FlatList, Image, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { getMessages } from "../../api/messages";
import { resolveMediaUrl } from "../../constants/config";
import Avatar from "../../components/Avatar";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "ContactInfo">;

const GRID_GAP = 3;

/**
 * DM contact info + shared media. Deliberately lighter than the CampusOne
 * directory profile web's ContactPanel shows (department/role/bio) — that
 * needs a directory API this app doesn't have wired up yet. What's here
 * (identity + shared photos) doesn't need one, since it's built entirely
 * from data already available from the chat itself.
 */
export default function ContactInfoScreen({ route }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { userId, name, containerId } = route.params;

  const { data: messages } = useQuery({
    queryKey: ["messages", containerId],
    queryFn: () => getMessages(containerId),
  });

  const media = useMemo(
    () => (messages ?? []).filter((m) => m.type === "image" && m.attachments?.[0]?.url).reverse(),
    [messages]
  );

  return (
    <FlatList
      style={styles.container}
      data={media}
      keyExtractor={(m) => m.id}
      numColumns={3}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <Avatar name={name} size={80} />
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.sectionLabel}>
            SHARED MEDIA {media.length > 0 ? `(${media.length})` : ""}
          </Text>
          {media.length === 0 ? <Text style={styles.emptyText}>No photos shared yet.</Text> : null}
        </View>
      }
      renderItem={({ item }) => {
        const uri = resolveMediaUrl(item.attachments[0]?.url);
        return uri ? <Image source={{ uri }} style={styles.thumb} /> : null;
      }}
      contentContainerStyle={styles.grid}
    />
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerBlock: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 4,
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginTop: 8,
    marginBottom: 12,
  },
  sectionLabel: {
    alignSelf: "flex-start",
    marginLeft: 16,
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textMuted,
  },
  grid: {
    paddingHorizontal: 16,
  },
  thumb: {
    flex: 1 / 3,
    aspectRatio: 1,
    margin: GRID_GAP,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
});
