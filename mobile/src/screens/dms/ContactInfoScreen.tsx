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
 * faculty-only CampusOne directory API this app doesn't call. Styled to
 * match ChannelInfoScreen's hero + quick-row + card layout.
 */
export default function ContactInfoScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { name, containerId } = route.params;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.hero}>
        <Avatar name={name} size={84} />
        <Text style={styles.name}>{name}</Text>
      </View>

      <View style={styles.quickRow}>
        <QuickAction
          icon="🖼️"
          label="Media"
          onPress={() => navigation.navigate("MessageList", { containerId, mode: "media", title: "Shared media", chatTitle: name, chatKind: "dm" })}
        />
        <QuickAction
          icon="📌"
          label="Pinned"
          onPress={() => navigation.navigate("MessageList", { containerId, mode: "pinned", title: "Pinned messages", chatTitle: name, chatKind: "dm" })}
        />
        <QuickAction
          icon="⭐"
          label="Starred"
          onPress={() => navigation.navigate("MessageList", { containerId, mode: "starred", title: "Starred messages", chatTitle: name, chatKind: "dm" })}
        />
      </View>
    </ScrollView>
  );
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable style={styles.quickBtn} onPress={onPress}>
      <View style={styles.quickCircle}><Text style={{ fontSize: 17 }}>{icon}</Text></View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    alignItems: "center",
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 24,
    gap: 4,
  },
  name: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.text,
    marginTop: 10,
  },
  quickRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  quickBtn: {
    alignItems: "center",
    gap: 6,
    width: 68,
  },
  quickCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
  },
});
