import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { joinChannelByLink } from "../../api/channels";
import { apiErrorMessage } from "../../api/client";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "JoinChannel">;

/** Landing screen for the cuorbit.app/join/:code deep link. */
export default function JoinChannelScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { code } = route.params;
  const [state, setState] = useState<"joining" | "joined" | "pending" | "error">("joining");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<{ id: string; name: string; topic: string } | null>(null);

  useEffect(() => {
    joinChannelByLink(code)
      .then((d) => {
        if (d.pendingApproval) {
          setState("pending");
          setChannel(d.channel ?? null);
        } else {
          setState("joined");
          setChannel(d.channel ?? null);
        }
      })
      .catch((e) => {
        setState("error");
        setMessage(apiErrorMessage(e, "Could not join that channel."));
      });
  }, [code]);

  if (state === "joining") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.text}>Joining channel…</Text>
      </View>
    );
  }

  if (state === "error") {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{message}</Text>
        <Pressable onPress={() => navigation.replace("List")} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Back to Home</Text>
        </Pressable>
      </View>
    );
  }

  if (state === "pending") {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Request sent</Text>
        <Text style={styles.text}>
          #{channel?.name ?? "This channel"} requires admin approval to join — you'll get access once
          approved.
        </Text>
        <Pressable onPress={() => navigation.replace("List")} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Back to Home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <Text style={styles.title}>Joined #{channel?.name ?? "channel"}</Text>
      <Pressable
        onPress={() =>
          channel
            ? navigation.replace("Chat", { containerId: channel.id, title: channel.name, kind: "channel" })
            : navigation.replace("List")
        }
        style={styles.actionButton}
      >
        <Text style={styles.actionButtonText}>Open channel</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  text: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    color: colors.danger,
    textAlign: "center",
  },
  actionButton: {
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  actionButtonText: {
    color: colors.primaryText,
    fontWeight: "700",
    fontSize: 14,
  },
});
