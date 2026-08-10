import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { createChannel } from "../../api/channels";
import { colors } from "../../theme/colors";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "CreateChannel">;

export default function CreateChannelScreen({ navigation }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: () => createChannel({ name: name.trim(), description, type: isPrivate ? "private" : "public" }),
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ["home"] });
      navigation.replace("Chat", { containerId: channel.id, title: channel.name, kind: "channel" });
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Channel name</Text>
      <TextInput
        autoFocus
        value={name}
        onChangeText={setName}
        placeholder="e.g. bca-2024-project"
        style={styles.input}
        maxLength={80}
      />

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="What is this channel for?"
        style={styles.input}
        maxLength={140}
      />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Private — only invited members can find and join</Text>
        <Switch value={isPrivate} onValueChange={setIsPrivate} />
      </View>

      {create.isError ? <Text style={styles.error}>Couldn't create the channel. Please try again.</Text> : null}

      <Pressable
        onPress={() => create.mutate()}
        disabled={!name.trim() || create.isPending}
        style={[styles.submit, (!name.trim() || create.isPending) && styles.submitDisabled]}
      >
        {create.isPending ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : (
          <Text style={styles.submitText}>Create channel</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 6,
    backgroundColor: colors.background,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    marginTop: 16,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    gap: 12,
  },
  switchLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    marginTop: 16,
  },
  submit: {
    marginTop: 28,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: colors.primaryText,
    fontWeight: "700",
    fontSize: 15,
  },
});
