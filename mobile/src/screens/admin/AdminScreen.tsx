import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import Avatar from "../../components/Avatar";
import {
  bulkAddUsers, changeUserRole, getAdminUsers, getAuditLog, getDeletedMessages, promoteByEmail, removeUser, setUserActive,
  type AuditLogEntry, type DeletedMessage,
} from "../../api/admin";
import { apiErrorMessage } from "../../api/client";
import { timeLabel } from "../../lib/format";
import { useAuthStore } from "../../state/authStore";
import { useThemeColors } from "../../state/themeStore";
import type { User } from "../../types/api";

const ROLES = ["student", "faculty", "admin", "examcell", "coordinator"] as const;
const TABS = [
  { id: "members", label: "Members" },
  { id: "audit", label: "Audit log" },
  { id: "deleted", label: "Deleted" },
] as const;

export default function AdminScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("members");

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <Pressable key={t.id} onPress={() => setTab(t.id)} style={[styles.tab, tab === t.id && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      {tab === "members" ? <MembersTab /> : tab === "audit" ? <AuditTab /> : <DeletedTab />}
    </View>
  );
}

function MembersTab() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const selfId = useAuthStore((s) => s.user?.id);
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bulkEmails, setBulkEmails] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoteBusy, setPromoteBusy] = useState(false);

  const load = () => getAdminUsers().then(setUsers).catch((e) => setError(apiErrorMessage(e)));
  useEffect(() => { load(); }, []);

  const onRoleChange = (user: User) => {
    Alert.alert(
      "Change role",
      user.name,
      ROLES.map((r) => ({ text: r, onPress: () => changeUserRole(user.id, r).then(load).catch((e) => setError(apiErrorMessage(e))) }))
    );
  };

  const onToggleActive = async (user: User) => {
    try { await setUserActive(user.id, user.is_active === false); load(); } catch (e) { setError(apiErrorMessage(e)); }
  };

  const onRemove = (user: User) => {
    Alert.alert("Remove member", `Remove ${user.name} from the workspace?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        try { await removeUser(user.id); load(); } catch (e) { setError(apiErrorMessage(e)); }
      } },
    ]);
  };

  const onBulkAdd = async () => {
    setBulkBusy(true);
    try {
      const emails = bulkEmails.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      const result = await bulkAddUsers(emails);
      Alert.alert("Bulk add", `${result.added.length} added, ${result.skipped.length} skipped`);
      setBulkEmails("");
      load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBulkBusy(false);
    }
  };

  const onPromote = async () => {
    setPromoteBusy(true);
    try {
      await promoteByEmail(promoteEmail.trim().toLowerCase());
      Alert.alert("Promoted", `${promoteEmail.trim()} is now a superadmin.`);
      setPromoteEmail("");
      load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setPromoteBusy(false);
    }
  };

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!users) return <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />;

  return (
    <FlatList
      data={users}
      keyExtractor={(u) => u.id}
      contentContainerStyle={{ paddingBottom: 24 }}
      ListHeaderComponent={
        <View>
          <View style={styles.bulkBox}>
            <Text style={styles.bulkLabel}>Make superadmin by email</Text>
            <TextInput
              value={promoteEmail}
              onChangeText={setPromoteEmail}
              placeholder="name@cutm.ac.in"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.bulkInput}
            />
            <Pressable onPress={onPromote} disabled={promoteBusy || !promoteEmail.trim()} style={styles.bulkButton}>
              <Text style={styles.bulkButtonText}>{promoteBusy ? "Promoting…" : "Promote"}</Text>
            </Pressable>
          </View>
        <View style={styles.bulkBox}>
          <Text style={styles.bulkLabel}>Bulk add by campus email</Text>
          <TextInput
            value={bulkEmails}
            onChangeText={setBulkEmails}
            placeholder="one@cutm.ac.in, two@cutmap.ac.in ..."
            placeholderTextColor={colors.textMuted}
            multiline
            style={styles.bulkInput}
          />
          <Pressable onPress={onBulkAdd} disabled={bulkBusy || !bulkEmails.trim()} style={styles.bulkButton}>
            <Text style={styles.bulkButtonText}>{bulkBusy ? "Adding…" : "Add"}</Text>
          </Pressable>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.memberRow}>
          <Avatar name={item.name} url={item.avatarUrl} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.memberName}>{item.name}</Text>
            <Text style={styles.memberEmail}>{item.campusEmail || item.campus_email || item.email}</Text>
            <View style={styles.memberMetaRow}>
              <Pressable onPress={() => onRoleChange(item)} disabled={item.id === selfId}>
                <Text style={styles.roleChip}>{item.role}</Text>
              </Pressable>
              {item.is_active === false ? <Text style={styles.deactivatedChip}>Deactivated</Text> : null}
            </View>
          </View>
          {item.id !== selfId ? (
            <View style={{ gap: 4 }}>
              <Pressable onPress={() => onToggleActive(item)}>
                <Text style={styles.linkText}>{item.is_active === false ? "Reactivate" : "Deactivate"}</Text>
              </Pressable>
              <Pressable onPress={() => onRemove(item)}>
                <Text style={styles.linkTextDanger}>Remove</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    />
  );
}

function AuditTab() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getAuditLog().then(setEntries).catch((e) => setError(apiErrorMessage(e))); }, []);

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!entries) return <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />;
  if (entries.length === 0) return <Text style={styles.empty}>No admin actions logged yet.</Text>;

  return (
    <FlatList
      data={entries}
      keyExtractor={(e) => e.id}
      renderItem={({ item }) => (
        <View style={styles.logRow}>
          <View style={styles.memberMetaRow}>
            <Text style={styles.logAction}>{item.action}</Text>
            <Text style={styles.logTime}>{timeLabel(new Date(item.createdAt).getTime())}</Text>
          </View>
          <Text style={styles.logDetail}>
            {item.actor_name} {item.target_type ? `→ ${item.target_type}` : ""} {item.detail ? `— ${item.detail}` : ""}
          </Text>
        </View>
      )}
    />
  );
}

function DeletedTab() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [messages, setMessages] = useState<DeletedMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getDeletedMessages().then(setMessages).catch((e) => setError(apiErrorMessage(e))); }, []);

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!messages) return <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />;
  if (messages.length === 0) return <Text style={styles.empty}>No deleted messages.</Text>;

  return (
    <FlatList
      data={messages}
      keyExtractor={(m) => m.id}
      renderItem={({ item }) => (
        <View style={styles.logRow}>
          <View style={styles.memberMetaRow}>
            <Text style={styles.logAction}>{item.sender_name}</Text>
            <Text style={styles.logTime}>deleted {timeLabel(new Date(item.deleted_at).getTime())}</Text>
          </View>
          <Text style={styles.logDetail}>{item.text}</Text>
        </View>
      )}
    />
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primaryText,
  },
  error: {
    color: colors.danger,
    marginTop: 16,
    textAlign: "center",
  },
  empty: {
    color: colors.textMuted,
    marginTop: 16,
    textAlign: "center",
  },
  bulkBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  bulkLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.textMuted,
    marginBottom: 6,
  },
  bulkInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
    color: colors.text,
    minHeight: 44,
    textAlignVertical: "top",
  },
  bulkButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bulkButtonText: {
    color: colors.primaryText,
    fontSize: 12,
    fontWeight: "600",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  memberName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  memberEmail: {
    fontSize: 11,
    color: colors.textMuted,
  },
  memberMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  roleChip: {
    fontSize: 11,
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  deactivatedChip: {
    fontSize: 11,
    color: colors.danger,
  },
  linkText: {
    fontSize: 11,
    color: colors.primary,
  },
  linkTextDanger: {
    fontSize: 11,
    color: colors.danger,
  },
  logRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  logAction: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  logTime: {
    fontSize: 11,
    color: colors.textMuted,
  },
  logDetail: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
});
