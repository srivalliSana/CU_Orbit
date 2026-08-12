import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  addChannelMember,
  getChannel,
  getChannelMembers,
  removeChannelMember,
  updateChannel,
  type ChannelMemberRow,
} from "../../api/channels";
import { listUsers } from "../../api/users";
import { apiErrorMessage } from "../../api/client";
import { useAuthStore } from "../../state/authStore";
import Avatar from "../../components/Avatar";
import { colors } from "../../theme/colors";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "ChannelInfo">;

/**
 * Mirrors web/src/components/ChannelInfoPanel.jsx. Permission rules are
 * enforced server-side (isFacultyEmail() + creator-protection in
 * server/server.js) — this screen just reflects what the server will
 * actually allow, surfacing its rejection reason rather than guessing.
 */
export default function ChannelInfoScreen({ route }: Props) {
  const { channelId } = route.params;
  const selfId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const channelQuery = useQuery({ queryKey: ["channel", channelId], queryFn: () => getChannel(channelId) });
  const membersQuery = useQuery({
    queryKey: ["channelMembers", channelId],
    queryFn: () => getChannelMembers(channelId),
  });
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: listUsers, enabled: adding });

  const channel = channelQuery.data;
  const members = membersQuery.data ?? [];
  const myMembership = members.find((m) => m.id === selfId);
  const isChannelAdmin = myMembership?.role === "admin";
  const isCreator = (id: string) => channel?.created_by === id;

  const reload = () => {
    queryClient.invalidateQueries({ queryKey: ["channel", channelId] });
    queryClient.invalidateQueries({ queryKey: ["channelMembers", channelId] });
    queryClient.invalidateQueries({ queryKey: ["home"] });
  };

  const addMember = async (userId: string) => {
    setBusyUserId(userId);
    setError(null);
    try {
      await addChannelMember(channelId, userId);
      reload();
      setAdding(false);
    } catch (e) {
      setError(apiErrorMessage(e, "Could not add that person."));
    } finally {
      setBusyUserId(null);
    }
  };

  const removeMember = (userId: string, name: string) => {
    Alert.alert(`Remove ${name}?`, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusyUserId(userId);
          setError(null);
          try {
            await removeChannelMember(channelId, userId);
            reload();
          } catch (e) {
            setError(apiErrorMessage(e, "Could not remove that person."));
          } finally {
            setBusyUserId(null);
          }
        },
      },
    ]);
  };

  const setRole = async (userId: string, role: "admin" | "member") => {
    setBusyUserId(userId);
    setError(null);
    try {
      await addChannelMember(channelId, userId, role);
      reload();
    } catch (e) {
      setError(apiErrorMessage(e, "Could not change that role."));
    } finally {
      setBusyUserId(null);
    }
  };

  const toggle = async (field: keyof NonNullable<typeof channel>, value: boolean) => {
    setError(null);
    try {
      await updateChannel(channelId, { [field]: value });
      reload();
    } catch (e) {
      setError(apiErrorMessage(e, "Could not update that setting."));
    }
  };

  const candidates = (usersQuery.data ?? []).filter((u) => !members.some((m) => m.id === u.id));

  if (channelQuery.isLoading || membersQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={members}
      keyExtractor={(m) => m.id}
      ListHeaderComponent={
        <View>
          <View style={styles.headerBlock}>
            <Avatar name={channel?.name ?? ""} size={72} />
            <Text style={styles.channelName}># {channel?.name}</Text>
            {channel?.topic ? <Text style={styles.topic}>{channel.topic}</Text> : null}
            <Text style={styles.memberCount}>
              {channel?.member_count} member{channel?.member_count === 1 ? "" : "s"}
            </Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {isChannelAdmin && channel ? (
            <View style={styles.settingsBlock}>
              <Text style={styles.sectionLabel}>SETTINGS</Text>
              <ToggleRow
                label="Only admins can post"
                value={channel.restricted_messaging}
                onChange={(v) => toggle("restricted_messaging", v)}
              />
              <ToggleRow
                label="Only admins can edit channel info"
                value={channel.info_edit_restricted}
                onChange={(v) => toggle("info_edit_restricted", v)}
              />
              <ToggleRow
                label="Approval required to join"
                value={channel.approval_required}
                onChange={(v) => toggle("approval_required", v)}
              />
            </View>
          ) : null}

          <View style={styles.membersHeaderRow}>
            <Text style={styles.sectionLabel}>MEMBERS</Text>
            <Pressable onPress={() => setAdding((v) => !v)}>
              <Text style={styles.addLink}>{adding ? "Cancel" : "+ Add"}</Text>
            </Pressable>
          </View>

          {adding ? (
            <View style={styles.addBox}>
              {usersQuery.isLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : candidates.length === 0 ? (
                <Text style={styles.emptyText}>No one else to add.</Text>
              ) : (
                candidates.map((c) => (
                  <Pressable
                    key={c.id}
                    disabled={busyUserId === c.id}
                    onPress={() => addMember(c.id)}
                    style={styles.candidateRow}
                  >
                    <Avatar name={c.name} url={c.avatarUrl} size={32} />
                    <Text style={styles.candidateName}>{c.name}</Text>
                  </Pressable>
                ))
              )}
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.memberRow}>
          <Avatar name={item.name} url={item.avatarUrl} size={36} />
          <View style={styles.memberMid}>
            <Text style={styles.memberName}>
              {item.name}
              {isCreator(item.id) ? <Text style={styles.creatorTag}>  creator</Text> : null}
            </Text>
            {item.role === "admin" ? <Text style={styles.adminTag}>Admin</Text> : null}
          </View>
          {isChannelAdmin && !isCreator(item.id) && item.id !== selfId ? (
            <View style={styles.memberActions}>
              <Pressable
                disabled={busyUserId === item.id}
                onPress={() => setRole(item.id, item.role === "admin" ? "member" : "admin")}
              >
                <Text style={styles.actionText}>{item.role === "admin" ? "Demote" : "Make admin"}</Text>
              </Pressable>
              <Pressable disabled={busyUserId === item.id} onPress={() => removeMember(item.id, item.name)}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    />
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerBlock: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 4,
  },
  channelName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginTop: 8,
  },
  topic: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  memberCount: {
    fontSize: 12,
    color: colors.textMuted,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  settingsBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  membersHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
  },
  addLink: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 13,
  },
  addBox: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 8,
    gap: 4,
  },
  emptyText: {
    fontSize: 12,
    color: colors.textMuted,
    padding: 8,
  },
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  candidateName: {
    fontSize: 14,
    color: colors.text,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  memberMid: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    color: colors.text,
  },
  creatorTag: {
    fontSize: 10,
    color: colors.textMuted,
  },
  adminTag: {
    fontSize: 11,
    color: colors.primary,
  },
  memberActions: {
    flexDirection: "row",
    gap: 14,
  },
  actionText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  removeText: {
    fontSize: 11,
    color: colors.danger,
  },
});
