import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Button, StyleSheet, Text, View } from "react-native";
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
        <Button title="Back to Home" onPress={() => navigation.replace("List")} />
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
        <Button title="Back to Home" onPress={() => navigation.replace("List")} />
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <Text style={styles.title}>Joined #{channel?.name ?? "channel"}</Text>
      <Button
        title="Open channel"
        onPress={() =>
          channel
            ? navigation.replace("Chat", { containerId: channel.id, title: channel.name, kind: "channel" })
            : navigation.replace("List")
        }
      />
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
});
