import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import Avatar from "./Avatar";
import { blockUser, getUser, reportUser, unblockUser } from "../api/users";
import { useThemeColors } from "../state/themeStore";
import type { User } from "../types/api";

/**
 * Tap a name/avatar on a message to see this — anyone signed into CU Orbit
 * may open anyone else's card and start a DM, whether or not they're
 * faculty; the campus directory (search-all-of-CampusOne) stays a separate,
 * faculty-only feature. Access here is scoped by already knowing the
 * sender's id from a conversation you're both in, not open browsing.
 */
export default function UserProfileModal({
  userId,
  currentUserId,
  onClose,
  onOpenChat,
}: {
  userId: string | null;
  currentUserId?: string;
  onClose: () => void;
  onOpenChat: (chat: { id: string; kind: "dm"; title: string }) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSent, setReportSent] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setUser(null);
    setError(null);
    setReportOpen(false);
    setReportSent(false);
    setReportReason("");
    getUser(userId)
      .then(setUser)
      .catch(() => setError("Could not load this profile."));
  }, [userId]);

  const isMe = userId === currentUserId;

  const sendMessage = () => {
    if (!user || !currentUserId || !userId) return;
    const dmId = [currentUserId, userId].sort().join("_");
    onOpenChat({ id: dmId, kind: "dm", title: user.name });
  };

  const toggleBlock = async () => {
    if (!user || !userId) return;
    setBlockBusy(true);
    try {
      await (user.is_blocked_by_me ? unblockUser : blockUser)(userId);
      setUser((u) => (u ? { ...u, is_blocked_by_me: !u.is_blocked_by_me } : u));
    } catch {
      setError("Could not update block status.");
    } finally {
      setBlockBusy(false);
    }
  };

  const submitReport = async () => {
    if (!userId) return;
    try {
      await reportUser(userId, reportReason.trim());
      setReportSent(true);
      setTimeout(() => { setReportOpen(false); setReportSent(false); setReportReason(""); }, 1500);
    } catch {
      setError("Could not send the report.");
    }
  };

  return (
    <Modal visible={!!userId} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!user && !error ? <Text style={styles.loading}>Loading…</Text> : null}
          {user ? (
            <>
              <View style={styles.avatarWrap}>
                <Avatar name={user.name} url={user.avatarUrl ?? undefined} size={72} />
              </View>
              <Text style={styles.name}>{user.name}</Text>
              {user.status_emoji || user.status_text ? (
                <Text style={styles.status}>{user.status_emoji} {user.status_text}</Text>
              ) : null}
              {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
              {user.role && user.role !== "student" ? <Text style={styles.role}>{user.role}</Text> : null}

              {!isMe ? (
                <Pressable style={styles.sendButton} onPress={sendMessage}>
                  <Text style={styles.sendButtonText}>Send message</Text>
                </Pressable>
              ) : null}
              {!isMe ? (
                <View style={styles.dangerRow}>
                  <Pressable style={styles.dangerButton} onPress={toggleBlock} disabled={blockBusy}>
                    <Text style={styles.dangerButtonText}>{user.is_blocked_by_me ? "Unblock" : "Block"}</Text>
                  </Pressable>
                  <Pressable style={styles.dangerButton} onPress={() => setReportOpen(true)}>
                    <Text style={styles.dangerButtonText}>Report</Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </>
          ) : null}

          {reportOpen ? (
            <View style={styles.reportOverlay}>
              <Text style={styles.name}>Report {user?.name}</Text>
              {reportSent ? (
                <Text style={styles.reportSentText}>Thanks — an admin will review this.</Text>
              ) : (
                <>
                  <TextInput
                    value={reportReason}
                    onChangeText={setReportReason}
                    placeholder="What happened? (optional)"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    style={styles.reportInput}
                  />
                  <View style={styles.dangerRow}>
                    <Pressable style={styles.closeButton} onPress={() => setReportOpen(false)}>
                      <Text style={styles.closeButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={styles.sendReportButton} onPress={submitReport}>
                      <Text style={styles.sendButtonText}>Send report</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  loading: { color: colors.textMuted, paddingVertical: 24 },
  error: { color: colors.danger },
  avatarWrap: { marginBottom: 4 },
  name: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 8 },
  status: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  bio: { fontSize: 14, color: colors.text, marginTop: 8, textAlign: "center" },
  role: { fontSize: 11, color: colors.primary, textTransform: "uppercase", marginTop: 6, letterSpacing: 0.4 },
  sendButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    width: "100%",
    alignItems: "center",
  },
  sendButtonText: { color: colors.primaryText, fontWeight: "600", fontSize: 14 },
  closeButton: { marginTop: 8, paddingVertical: 8, width: "100%", alignItems: "center" },
  closeButtonText: { color: colors.textMuted, fontSize: 14 },
  dangerRow: { flexDirection: "row", gap: 8, width: "100%", marginTop: 8 },
  dangerButton: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
  dangerButtonText: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  reportOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  reportInput: {
    width: "100%",
    minHeight: 70,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: "top",
  },
  reportSentText: { color: colors.primary, fontSize: 14, marginTop: 12, textAlign: "center" },
  sendReportButton: {
    flex: 1,
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
});
