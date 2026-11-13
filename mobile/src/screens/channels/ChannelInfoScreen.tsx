import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import ZoomableImage from "../../components/ZoomableImage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";

import {
  addChannelMember,
  approveJoinRequest,
  bulkAddChannelMembers,
  getChannel,
  getChannelMembers,
  getJoinRequests,
  inviteByEmail,
  rejectJoinRequest,
  removeChannelMember,
  updateChannel,
} from "../../api/channels";
import { listUsers } from "../../api/users";
import { setChannelActive } from "../../api/admin";
import { uploadFile } from "../../api/upload";
import { apiErrorMessage } from "../../api/client";
import { parseCsv } from "../../lib/csv";
import { useAuthStore } from "../../state/authStore";
import Avatar from "../../components/Avatar";
import { resolveMediaUrl } from "../../constants/config";
import { useThemeColors } from "../../state/themeStore";
import { confirmAsync } from "../../components/ConfirmDialog";
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
  const [editingInfo, setEditingInfo] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [topicInput, setTopicInput] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

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
  const filteredMembers = members.filter((m) =>
    m.name?.toLowerCase().includes(memberSearch.trim().toLowerCase())
  );

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
      setCandidateSearch("");
    } catch (e) {
      setError(apiErrorMessage(e, "Could not add that person."));
    } finally {
      setBusyUserId(null);
    }
  };

  // Mirrors web's bulkAddCsv: parsed on-device with the same parseCsv the
  // app's list-import feature already uses, server only ever sees a plain
  // email list (first column of each row; a header row or a 2nd column,
  // like a names export, is ignored the same way).
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const bulkAddCsv = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "*/*"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    setError(null);
    setBulkBusy(true);
    try {
      const text = await new File(result.assets[0].uri).text();
      const emails = parseCsv(text)
        .map((row) => row[0]?.trim().toLowerCase() || "")
        .filter((email) => email && EMAIL_RE.test(email) && email !== "email");
      if (!emails.length) {
        // A .xlsx/.xls file is a zip/binary format, not plain text — reading
        // it as text just produces binary noise, so the generic "no emails
        // found" message is actively misleading for the single most common
        // mistake here (picking Excel's native format instead of actually
        // exporting to CSV).
        const looksLikeOffice = /\.xlsx?$/i.test(result.assets[0].name || "") || text.startsWith("PK");
        setError(
          looksLikeOffice
            ? 'That looks like an Excel file, not a CSV. In Excel, use File → Save As → "CSV UTF-8 (Comma delimited)", then upload that .csv file.'
            : "No email addresses found in that file."
        );
        return;
      }
      const res = await bulkAddChannelMembers(channelId, emails);
      reload();
      Alert.alert(
        "Bulk add",
        `${res.added.length} added, ${res.skipped.length} skipped` +
          (res.skipped.length ? ` (not a staff/faculty campus email, or already a member)` : "")
      );
    } catch (e) {
      setError(apiErrorMessage(e, "Could not bulk-add from that file."));
    } finally {
      setBulkBusy(false);
    }
  };

  const removeMember = async (userId: string, name: string) => {
    const ok = await confirmAsync({ title: `Remove ${name}?`, confirmText: "Remove", destructive: true });
    if (!ok) return;
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

  const leaveChannel = async () => {
    if (!selfId) return;
    const ok = await confirmAsync({
      title: "Leave channel?",
      message: `You'll stop receiving messages from ${channel?.name ? `#${channel.name}` : "this channel"}.`,
      confirmText: "Leave",
      destructive: true,
    });
    if (!ok) return;
    setBusyUserId(selfId);
    setError(null);
    try {
      await removeChannelMember(channelId, selfId);
      queryClient.invalidateQueries({ queryKey: ["home"] });
      navigation.goBack();
    } catch (e) {
      setError(apiErrorMessage(e, "Could not leave that channel."));
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

  const startEditingInfo = () => {
    if (!channel) return;
    setNameInput(channel.name);
    setTopicInput(channel.topic || "");
    setEditingInfo(true);
  };

  const saveInfo = async () => {
    setSavingInfo(true);
    setError(null);
    try {
      await updateChannel(channelId, { name: nameInput.trim(), topic: topicInput.trim() });
      reload();
      setEditingInfo(false);
    } catch (e) {
      setError(apiErrorMessage(e, "Could not save channel info."));
    } finally {
      setSavingInfo(false);
    }
  };

  const changeAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo access needed", "Enable photo access in settings to change the channel photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setUploadingAvatar(true);
    setError(null);
    try {
      const { url } = await uploadFile({
        uri: asset.uri,
        name: asset.fileName || "channel-avatar.jpg",
        mimeType: asset.mimeType || "image/jpeg",
      });
      await updateChannel(channelId, { avatar_url: url });
      reload();
    } catch (e) {
      setError(apiErrorMessage(e, "Could not update the channel photo."));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const candidates = (usersQuery.data ?? []).filter((u) => !members.some((m) => m.id === u.id));
  const filteredCandidates = candidates.filter((c) => {
    const q = candidateSearch.trim().toLowerCase();
    if (!q) return true;
    const email = (c.campusEmail || c.campus_email || c.email || "").toLowerCase();
    return c.name?.toLowerCase().includes(q) || email.includes(q);
  });

  const toggleChannelActive = () => {
    if (!channel) return;
    const active = channel.is_active === false;   // currently inactive → reactivating
    const apply = async () => {
      setDeleting(true);
      try {
        await setChannelActive(channelId, active);
        queryClient.invalidateQueries({ queryKey: ["home"] });
        reload();
      } catch (e) {
        setError(apiErrorMessage(e, "Could not update this channel."));
      } finally {
        setDeleting(false);
      }
    };
    if (!active) {
      confirmAsync({
        title: `Deactivate #${channel.name}?`,
        message: "No one will be able to see or message in it until you reactivate it.",
        confirmText: "Deactivate",
        destructive: true,
      }).then((ok) => { if (ok) apply(); });
    } else {
      apply();
    }
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
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.hero}>
        {isChannelAdmin || isSuperAdmin ? (
          <Pressable
            onPress={() => (channel?.avatar_url ? setAvatarViewerVisible(true) : changeAvatar())}
            disabled={uploadingAvatar}
            style={styles.avatarEditWrap}
          >
            <Avatar name={channel?.name ?? ""} url={channel?.avatar_url} size={84} />
            <Pressable
              onPress={changeAvatar}
              disabled={uploadingAvatar}
              hitSlop={8}
              style={styles.avatarEditBadge}
            >
              {uploadingAvatar ? <ActivityIndicator size="small" color={colors.primaryText} /> : <Text style={{ fontSize: 11 }}>📷</Text>}
            </Pressable>
          </Pressable>
        ) : (
          <Pressable onPress={() => channel?.avatar_url && setAvatarViewerVisible(true)}>
            <Avatar name={channel?.name ?? ""} url={channel?.avatar_url} size={84} />
          </Pressable>
        )}

        <Modal
          visible={avatarViewerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setAvatarViewerVisible(false)}
        >
          <GestureHandlerRootView style={styles.avatarViewerBackdrop}>
            <Pressable style={styles.avatarViewerClose} onPress={() => setAvatarViewerVisible(false)} hitSlop={10}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
            {channel?.avatar_url ? (
              <ZoomableImage uri={resolveMediaUrl(channel.avatar_url) ?? channel.avatar_url} style={styles.avatarViewerImage} />
            ) : null}
          </GestureHandlerRootView>
        </Modal>

        {editingInfo ? (
          <View style={styles.editInfoBlock}>
            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Channel name"
              placeholderTextColor={colors.textMuted}
              style={styles.editInfoInput}
            />
            <TextInput
              value={topicInput}
              onChangeText={setTopicInput}
              placeholder="What's this channel about?"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.editInfoInput, { minHeight: 60, textAlignVertical: "top" }]}
            />
            <View style={styles.editInfoActions}>
              <Pressable onPress={() => setEditingInfo(false)} disabled={savingInfo}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveInfo} disabled={savingInfo || !nameInput.trim()}>
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>
                  {savingInfo ? "Saving…" : "Save"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.channelName}># {channel?.name}</Text>
            <Text style={styles.memberCount}>
              {channel?.member_count} member{channel?.member_count === 1 ? "" : "s"}
            </Text>
            {channel?.topic ? <Text style={styles.topic}>{channel.topic}</Text> : null}
            {isChannelAdmin || isSuperAdmin ? (
              <Pressable onPress={startEditingInfo}>
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 12, marginTop: 6 }}>
                  Edit name & topic
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.quickRow}>
        <QuickAction
          icon="🖼️"
          label="Media"
          onPress={() => navigation.navigate("MessageList", { containerId: channelId, mode: "media", title: "Shared media", chatTitle: `# ${channel?.name ?? ""}`, chatKind: "channel" })}
        />
        <QuickAction
          icon="📌"
          label="Pinned"
          onPress={() => navigation.navigate("MessageList", { containerId: channelId, mode: "pinned", title: "Pinned messages", chatTitle: `# ${channel?.name ?? ""}`, chatKind: "channel" })}
        />
        <QuickAction
          icon="⭐"
          label="Starred"
          onPress={() => navigation.navigate("MessageList", { containerId: channelId, mode: "starred", title: "Starred messages", chatTitle: `# ${channel?.name ?? ""}`, chatKind: "channel" })}
        />
        {isChannelAdmin || isSuperAdmin ? (
          <QuickAction icon="＋" label="Add" onPress={() => { setAdding((v) => !v); setCandidateSearch(""); }} />
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {channel && (isChannelAdmin || isSuperAdmin) ? (
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>INVITE</Text>
          <View style={styles.card}>
            <View style={styles.cardPad}>
              <Text style={styles.inviteHint}>
                Anyone with a cutm.ac.in or cutmap.ac.in account can join with this link, shared anywhere.
              </Text>
              <Pressable
                style={styles.shareButton}
                onPress={() =>
                  Share.share({
                    // cuorbit.app is only an App Links domain for native deep
                    // linking — it's never been hosted/DNS-pointed anywhere,
                    // so a link using it 404s with NXDOMAIN for anyone who
                    // taps it. letsconnect.cutm.ac.in is the actual live server
                    // and already serves GET /join/:code (same domain the
                    // email-invite and web share link already use).
                    message: `Join #${channel.name} on Let's Connect: https://letsconnect.cutm.ac.in/join/${channel.invite_code}`,
                  })
                }
              >
                <Text style={styles.shareButtonText}>Share invite link</Text>
              </Pressable>
            </View>
            {isChannelAdmin ? (
              <View style={[styles.cardPad, styles.cardDivider]}>
                <Text style={styles.inviteHint}>Invite by email — sends the join link to their campus email.</Text>
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
          </View>
        </View>
      ) : null}

      {isChannelAdmin && joinRequests.length > 0 ? (
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>JOIN REQUESTS · {joinRequests.length}</Text>
          <View style={styles.card}>
            {joinRequests.map((r, i) => (
              <View key={r.id} style={[styles.memberRow, i > 0 && styles.cardDivider]}>
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
        </View>
      ) : null}

      <View style={styles.sectionWrap}>
        <View style={styles.membersHeaderRow}>
          <Text style={styles.sectionLabel}>MEMBERS · {members.length}</Text>
          {isChannelAdmin || isSuperAdmin ? (
            <View style={{ flexDirection: "row", gap: 16 }}>
              <Pressable onPress={bulkAddCsv} disabled={bulkBusy}>
                <Text style={styles.addLink}>{bulkBusy ? "Adding…" : "Bulk add (CSV)"}</Text>
              </Pressable>
              <Pressable onPress={() => { setAdding((v) => !v); setCandidateSearch(""); }}>
                <Text style={styles.addLink}>{adding ? "Cancel" : "+ Add"}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {members.length > 6 ? (
          <TextInput
            value={memberSearch}
            onChangeText={setMemberSearch}
            placeholder="Search members"
            placeholderTextColor={colors.textMuted}
            style={styles.memberSearchInput}
          />
        ) : null}

        {adding ? (
          <View style={styles.addBox}>
            {usersQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <TextInput
                  value={candidateSearch}
                  onChangeText={setCandidateSearch}
                  placeholder="Search people to add"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  style={styles.memberSearchInput}
                />
                {filteredCandidates.length === 0 ? (
                  <Text style={styles.emptyText}>No one else to add.</Text>
                ) : (
                  filteredCandidates.map((c) => (
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
              </>
            )}
          </View>
        ) : null}

        <View style={styles.card}>
          {filteredMembers.map((item, i) => (
            <View key={item.id} style={[styles.memberRow, i > 0 && styles.cardDivider]}>
              <Avatar name={item.name} url={item.avatarUrl} size={36} />
              <View style={styles.memberMid}>
                <Text style={styles.memberName}>
                  {item.name}
                  {isCreator(item.id) ? <Text style={styles.creatorTag}>  creator</Text> : null}
                </Text>
                {item.role === "admin" ? <Text style={styles.adminTag}>Channel admin</Text> : null}
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
          ))}
        </View>
      </View>

      {isChannelAdmin && channel ? (
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>SETTINGS</Text>
          <View style={[styles.card, styles.cardPad]}>
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
        </View>
      ) : null}

      <View style={styles.sectionWrap}>
        <Text style={styles.sectionLabel}>MORE</Text>
        <View style={styles.card}>
          <NavRow icon="📋" label="Lists" onPress={() => navigation.navigate("Lists", { channelId, channelName: channel?.name })} />
          <NavRow icon="📝" label="Canvas" onPress={() => navigation.navigate("Canvas", { channelId })} divider />
          <NavRow icon="⚡" label="Workflows" onPress={() => navigation.navigate("Workflows", { channelId })} divider />
        </View>
      </View>

      <View style={styles.sectionWrap}>
        <Text style={[styles.sectionLabel, styles.dangerLabel]}>DANGER ZONE</Text>
        <View style={[styles.card, styles.dangerCard]}>
          {selfId && channel && !isCreator(selfId) ? (
            <Pressable style={styles.cardRow} onPress={leaveChannel} disabled={busyUserId === selfId}>
              <View style={[styles.iconWrap, styles.iconWrapDanger]}><Text>🚪</Text></View>
              <Text style={styles.deleteChannelText}>Leave channel</Text>
            </Pressable>
          ) : null}

          {isChannelAdmin && channel ? (
            <>
              {channel.archived_at ? (
                <Text style={styles.deactivatedNotice}>
                  This channel is archived — everyone can still read its history, but no one can post until it's unarchived.
                </Text>
              ) : null}
              <Pressable style={[styles.cardRow, styles.cardDivider]} onPress={() => toggle("archived", !channel.archived_at)}>
                <View style={[styles.iconWrap, styles.iconWrapDanger]}><Text>{channel.archived_at ? "📤" : "🗄️"}</Text></View>
                <Text style={styles.deleteChannelText}>{channel.archived_at ? "Unarchive channel" : "Archive channel"}</Text>
              </Pressable>
            </>
          ) : null}

          {isSuperAdmin && channel ? (
            <>
              {channel.is_active === false ? (
                <Text style={styles.deactivatedNotice}>
                  This channel is deactivated — hidden from members, and no one can message here until you reactivate it.
                </Text>
              ) : null}
              <Pressable style={[styles.cardRow, styles.cardDivider]} onPress={toggleChannelActive} disabled={deleting}>
                <View style={[styles.iconWrap, styles.iconWrapDanger]}><Text>{channel.is_active === false ? "✅" : "🚫"}</Text></View>
                <Text style={[styles.deleteChannelText, channel.is_active === false && styles.reactivateText]}>
                  {deleting ? "Updating…" : channel.is_active === false ? "Reactivate channel" : "Deactivate channel"}
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
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

function NavRow({ icon, label, onPress, divider }: { icon: string; label: string; onPress: () => void; divider?: boolean }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable style={[styles.cardRow, divider && styles.cardDivider]} onPress={onPress}>
      <View style={styles.iconWrap}><Text>{icon}</Text></View>
      <Text style={styles.navRowText}>{label}</Text>
    </Pressable>
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
  hero: {
    alignItems: "center",
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 24,
    gap: 4,
  },
  avatarEditWrap: {
    position: "relative",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.background,
  },
  avatarViewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarViewerImage: {
    width: "100%",
    height: "70%",
  },
  avatarViewerClose: {
    position: "absolute",
    top: 48,
    left: 16,
    zIndex: 1,
  },
  editInfoBlock: {
    width: "100%",
    paddingHorizontal: 24,
    marginTop: 8,
    gap: 8,
  },
  editInfoInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    textAlign: "center",
  },
  editInfoActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
  },
  channelName: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.text,
    marginTop: 10,
  },
  topic: {
    fontSize: 12.5,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 16,
    marginTop: 8,
    lineHeight: 18,
  },
  memberCount: {
    fontSize: 12.5,
    color: colors.textMuted,
    marginTop: 4,
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
  sectionWrap: {
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    overflow: "hidden",
  },
  cardPad: {
    padding: 14,
    gap: 8,
  },
  cardDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: `${colors.primary}22`,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapDanger: {
    backgroundColor: `${colors.danger}1A`,
  },
  dangerLabel: {
    color: colors.danger,
  },
  dangerCard: {
    borderColor: `${colors.danger}55`,
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
  reactivateText: {
    color: colors.success,
  },
  deactivatedNotice: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: `${colors.warning}22`,
    color: colors.warning,
    fontSize: 12,
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
  memberSearchInput: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
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
