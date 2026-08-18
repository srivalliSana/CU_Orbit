import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Share,
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
  approveJoinRequest,
  getChannel,
  getChannelMembers,
  getJoinRequests,
  inviteByEmail,
  rejectJoinRequest,
  removeChannelMember,
  updateChannel,
} from "../../api/channels";
import { listUsers } from "../../api/users";
import { deleteChannel } from "../../api/admin";
import { apiErrorMessage } from "../../api/client";
import { useAuthStore } from "../../state/authStore";
import Avatar from "../../components/Avatar";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "ChannelInfo">;

/**
 * Mirrors web/src/components/ChannelInfoPanel.jsx. Permission rules are
 * enforced server-side (isFacultyEmail() + creator-protection in
 * server/server.js) — this screen just reflects what the server will
 * actually allow, surfacing its rejection reason rather than guessing.
 */
export default function ChannelInfoScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { channelId } = route.params;
  const selfId = useAuthStore((s) => s.user?.id);
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "admin");
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitingByEmail, setInvitingByEmail] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const joinRequestsQuery = useQuery({
    queryKey: ["channelJoinRequests", channelId],
    queryFn: () => getJoinRequests(channelId),
    enabled: isChannelAdmin,
  });
  const joinRequests = joinRequestsQuery.data ?? [];
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

  const reload = () => {
    queryClient.invalidateQueries({ queryKey: ["channel", channelId] });
    queryClient.invalidateQueries({ queryKey: ["channelMembers", channelId] });
    queryClient.invalidateQueries({ queryKey: ["channelJoinRequests", channelId] });
    queryClient.invalidateQueries({ queryKey: ["home"] });
  };

  const respondToRequest = async (reqId: string, approve: boolean) => {
    setBusyRequestId(reqId);
    setError(null);
    try {
      await (approve ? approveJoinRequest : rejectJoinRequest)(channelId, reqId);
      reload();
    } catch (e) {
      setError(apiErrorMessage(e, "Could not update that request."));
    } finally {
      setBusyRequestId(null);
    }
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

  const sendInvite = async () => {
    setInvitingByEmail(true);
    setError(null);
    try {
      await inviteByEmail(channelId, inviteEmail.trim().toLowerCase());
      setInviteEmail("");
      Alert.alert("Invite sent", "They'll get an email with the join link.");
    } catch (e) {
      setError(apiErrorMessage(e, "Could not send that invite."));
    } finally {
      setInvitingByEmail(false);
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

  const confirmDeleteChannel = () => {
    if (!channel) return;
    Alert.alert(
      `Delete #${channel.name}?`,
      "This removes it for every member and cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteChannel(channelId);
              queryClient.invalidateQueries({ queryKey: ["home"] });
              navigation.goBack();
            } catch (e) {
              setError(apiErrorMessage(e, "Could not delete this channel."));
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (channelQuery.isLoading || membersQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (channelQuery.error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {apiErrorMessage(channelQuery.error, "Couldn't load this channel.")}
        </Text>
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

          {channel ? (
            <View style={styles.inviteBlock}>
              <Text style={styles.sectionLabel}>INVITE LINK</Text>
              <Text style={styles.inviteHint}>
                Anyone with a cutm.ac.in or cutmap.ac.in account can join with this link, shared anywhere.
              </Text>
              <Pressable
                style={styles.shareButton}
                onPress={() =>
                  Share.share({
                    message: `Join #${channel.name} on CU Orbit: https://cuorbit.app/join/${channel.invite_code}`,
                  })
                }
              >
                <Text style={styles.shareButtonText}>Share invite link</Text>
              </Pressable>
            </View>
          ) : null}

          {isChannelAdmin && channel ? (
            <View style={styles.inviteBlock}>
              <Text style={styles.sectionLabel}>INVITE BY EMAIL</Text>
              <Text style={styles.inviteHint}>Sends the join link to their campus email.</Text>
              <View style={styles.inviteEmailRow}>
                <TextInput
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  placeholder="name@cutm.ac.in"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.inviteEmailInput}
                />
                <Pressable
                  style={styles.shareButton}
                  onPress={sendInvite}
                  disabled={invitingByEmail || !inviteEmail.trim()}
                >
                  <Text style={styles.shareButtonText}>{invitingByEmail ? "Sending…" : "Send"}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {isChannelAdmin && joinRequests.length > 0 ? (
            <View style={styles.inviteBlock}>
              <Text style={styles.sectionLabel}>JOIN REQUESTS · {joinRequests.length}</Text>
              {joinRequests.map((r) => (
                <View key={r.id} style={styles.memberRow}>
                  <Avatar name={r.userName} size={32} />
                  <Text style={[styles.memberMid, styles.memberName]}>{r.userName}</Text>
                  <View style={styles.memberActions}>
                    <Pressable disabled={busyRequestId === r.id} onPress={() => respondToRequest(r.id, true)}>
                      <Text style={styles.actionText}>Approve</Text>
                    </Pressable>
                    <Pressable disabled={busyRequestId === r.id} onPress={() => respondToRequest(r.id, false)}>
                      <Text style={styles.removeText}>Reject</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

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

          <View style={styles.settingsBlock}>
            <Pressable
              style={styles.navRow}
              onPress={() => navigation.navigate("MessageList", { containerId: channelId, mode: "media", title: "Shared media", chatTitle: `# ${channel?.name ?? ""}`, chatKind: "channel" })}
            >
              <Text style={styles.navRowText}>🖼️ Shared media</Text>
            </Pressable>
            <Pressable
              style={styles.navRow}
              onPress={() => navigation.navigate("MessageList", { containerId: channelId, mode: "pinned", title: "Pinned messages", chatTitle: `# ${channel?.name ?? ""}`, chatKind: "channel" })}
            >
              <Text style={styles.navRowText}>📌 Pinned messages</Text>
            </Pressable>
            <Pressable
              style={styles.navRow}
              onPress={() => navigation.navigate("MessageList", { containerId: channelId, mode: "starred", title: "Starred messages", chatTitle: `# ${channel?.name ?? ""}`, chatKind: "channel" })}
            >
              <Text style={styles.navRowText}>⭐ Starred messages</Text>
            </Pressable>
          </View>

          {isSuperAdmin && channel ? (
            <View style={styles.settingsBlock}>
              <Pressable style={styles.navRow} onPress={confirmDeleteChannel} disabled={deleting}>
                <Text style={styles.deleteChannelText}>{deleting ? "Deleting…" : "🗑️ Delete channel"}</Text>
              </Pressable>
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
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
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
  errorText: {
    color: colors.danger,
    fontSize: 14,
    textAlign: "center",
  },
  inviteBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 8,
  },
  inviteHint: {
    fontSize: 11,
    color: colors.textMuted,
  },
  shareButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 2,
  },
  shareButtonText: {
    color: colors.primaryText,
    fontWeight: "600",
    fontSize: 13,
  },
  inviteEmailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inviteEmailInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
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
  navRow: {
    paddingVertical: 10,
  },
  navRowText: {
    fontSize: 14,
    color: colors.text,
  },
  deleteChannelText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.danger,
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
