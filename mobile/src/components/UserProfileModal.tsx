import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import Avatar from "./Avatar";
import { getUser } from "../api/users";
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

  useEffect(() => {
    if (!userId) return;
    setUser(null);
    setError(null);
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
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </>
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
});
