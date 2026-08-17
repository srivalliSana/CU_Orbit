import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import Avatar from "../../components/Avatar";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "ContactInfo">;

/**
 * DM contact info — identity plus links into the shared media/pinned/starred
 * browser (MessageListScreen), same as a channel's info screen. Deliberately
 * lighter than web's ContactPanel (department/role/bio) — that needs the
 * faculty-only CampusOne directory API this app doesn't call.
 */
export default function ContactInfoScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { name, containerId } = route.params;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerBlock}>
        <Avatar name={name} size={80} />
        <Text style={styles.name}>{name}</Text>
      </View>

      <View style={styles.navBlock}>
        <Pressable
          style={styles.navRow}
          onPress={() => navigation.navigate("MessageList", { containerId, mode: "media", title: "Shared media" })}
        >
          <Text style={styles.navRowText}>🖼️ Shared media</Text>
        </Pressable>
        <Pressable
          style={styles.navRow}
          onPress={() => navigation.navigate("MessageList", { containerId, mode: "pinned", title: "Pinned messages" })}
        >
          <Text style={styles.navRowText}>📌 Pinned messages</Text>
        </Pressable>
        <Pressable
          style={styles.navRow}
          onPress={() => navigation.navigate("MessageList", { containerId, mode: "starred", title: "Starred messages" })}
        >
          <Text style={styles.navRowText}>⭐ Starred messages</Text>
        </Pressable>
      </View>
    </ScrollView>
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
  },
  navBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  navRow: {
    paddingVertical: 12,
  },
  navRowText: {
    fontSize: 14,
    color: colors.text,
  },
});
