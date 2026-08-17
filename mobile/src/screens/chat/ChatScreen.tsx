import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Button, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useMessages } from "../../hooks/useMessages";
import { useChannelSocket } from "../../hooks/useSocket";
import { useTyping } from "../../hooks/useTyping";
import { markConversationRead } from "../../api/messages";
import { getChannelMembers } from "../../api/channels";
import { apiErrorMessage } from "../../api/client";
import { useAuthStore } from "../../state/authStore";
import MessageBubble from "../../components/MessageBubble";
import Composer from "../../components/Composer";
import ForwardModal from "../../components/ForwardModal";
import UserProfileModal from "../../components/UserProfileModal";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";
import type { Message } from "../../types/api";

type Props = NativeStackScreenProps<HomeStackParamList, "Chat">;

export default function ChatScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { containerId, title, kind } = route.params;
  const { data: messages, isLoading, error, refetch, send, react, remove, edit, pin, star } = useMessages(containerId);
  const { typingName, notifyTyping } = useTyping(containerId);
  const selfId = useAuthStore((s) => s.user?.id);
  const selfRole = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = selfRole === "admin";
  const [canModerate, setCanModerate] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  useChannelSocket(containerId);

  // "ADMIN: delete messages in own channels (from anyone)" — a channel's
  // own admin qualifies only for that channel; a workspace admin always does.
  useEffect(() => {
    if (isSuperAdmin) { setCanModerate(true); return; }
    if (kind !== "channel") { setCanModerate(false); return; }
    let cancelled = false;
    getChannelMembers(containerId)
      .then((members) => {
        if (cancelled) return;
        const me = members.find((m) => m.id === selfId);
        setCanModerate(me?.role === "admin");
      })
      .catch(() => setCanModerate(false));
    return () => { cancelled = true; };
  }, [containerId, kind, selfId, isSuperAdmin]);

  // DM containers are addressed as "<idA>_<idB>" sorted — the other
  // participant is whichever half of that isn't the signed-in user, so no
  // extra lookup is needed to know who this chat is with.
  const otherUserId = kind === "dm" ? containerId.split("_").find((id) => id !== selfId) : undefined;

  useEffect(() => {
    navigation.setOptions({
      title,
      headerRight: () => {
        if (kind === "channel") {
          return (
            <Pressable
              onPress={() => navigation.navigate("ChannelInfo", { channelId: containerId })}
              hitSlop={8}
            >
              <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
            </Pressable>
          );
        }
        if (kind === "dm" && otherUserId) {
          return (
            <Pressable
              onPress={() => navigation.navigate("ContactInfo", { userId: otherUserId, name: title, containerId })}
              hitSlop={8}
            >
              <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
            </Pressable>
          );
        }
        return undefined;
      },
    });
  }, [navigation, title, kind, containerId, otherUserId]);

  useEffect(() => {
    markConversationRead(containerId);
  }, [containerId]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{apiErrorMessage(error, "Couldn't load this chat.")}</Text>
        <View style={styles.retryButton}>
          <Button title="Try again" onPress={() => refetch()} color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            isOwn={item.sender_id === selfId}
            canModerate={canModerate}
            isSuperAdmin={isSuperAdmin}
            onReact={(emoji) => react.mutate({ messageId: item.id, emoji })}
            onDelete={() => remove.mutate(item.id)}
            onEdit={(text) => edit.mutate({ messageId: item.id, body: text })}
            onPin={(pinned) => pin.mutate({ messageId: item.id, pinned })}
            onReply={() => setReplyTo(item)}
            onForward={() => setForwarding(item)}
            onStar={(starred) => star.mutate({ messageId: item.id, starred })}
            onOpenProfile={(userId) => setProfileUserId(userId)}
          />
        )}
        contentContainerStyle={styles.list}
      />
      {typingName ? (
        <Text style={styles.typing}>{typingName} is typing…</Text>
      ) : null}
      <Composer
        onSend={(payload) => send.mutate(payload)}
        onTyping={notifyTyping}
        channelId={containerId}
        kind={kind}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />

      <ForwardModal
        message={forwarding}
        visible={!!forwarding}
        onClose={() => setForwarding(null)}
        onForwarded={() => setForwarding(null)}
      />

      <UserProfileModal
        userId={profileUserId}
        currentUserId={selfId}
        onClose={() => setProfileUserId(null)}
        onOpenChat={(chat) => {
          setProfileUserId(null);
          navigation.push("Chat", { containerId: chat.id, title: chat.title, kind: "dm" });
        }}
      />
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
  },
  errorText: {
    color: colors.danger,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 4,
  },
  list: {
    paddingVertical: 12,
  },
  typing: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    fontSize: 12,
    color: colors.textMuted,
  },
});
