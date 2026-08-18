import { useEffect, useMemo, useRef, useState } from "react";
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
import PollComposerModal from "../../components/PollComposerModal";
import { createPoll } from "../../api/messages";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";
import type { Message } from "../../types/api";

type Props = NativeStackScreenProps<HomeStackParamList, "Chat">;

export default function ChatScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { containerId, title, kind, scrollToMessageId } = route.params;
  const { data: messages, isLoading, error, refetch, send, react, remove, hide, edit, pin, star, vote } = useMessages(containerId);
  const { typingName, notifyTyping } = useTyping(containerId);
  const selfId = useAuthStore((s) => s.user?.id);
  const selfRole = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = selfRole === "admin";
  const [canModerate, setCanModerate] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const pinnedMessage = messages?.find((m) => m.is_pinned);

  const jumpToMessage = (id: string) => {
    const index = messages?.findIndex((m) => m.id === id) ?? -1;
    if (index === -1 || !listRef.current) return;
    listRef.current.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    setHighlightId(id);
    setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 1800);
  };

  // Arrived here from the Pinned/Starred list (a different screen) —
  // messages needs to have loaded before an index lookup means anything.
  useEffect(() => {
    if (!scrollToMessageId || !messages?.length) return;
    jumpToMessage(scrollToMessageId);
    navigation.setParams({ scrollToMessageId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToMessageId, messages?.length]);

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
      {pinnedMessage ? (
        <Pressable style={styles.pinnedBar} onPress={() => jumpToMessage(pinnedMessage.id)}>
          <Text style={styles.pinnedIcon}>📌</Text>
          <Text style={styles.pinnedText} numberOfLines={1}>
            Pinned: {pinnedMessage.text || (pinnedMessage.type === "poll" ? pinnedMessage.poll?.question : "Attachment")}
          </Text>
        </Pressable>
      ) : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        onScrollToIndexFailed={(info) => {
          // The target isn't rendered yet (variable-height rows) — approximate
          // an offset, then let the exact scrollToIndex retry land.
          setTimeout(() => {
            listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
            setTimeout(() => {
              if (scrollToMessageId) jumpToMessage(scrollToMessageId);
            }, 100);
          }, 50);
        }}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            isOwn={item.sender_id === selfId}
            canModerate={canModerate}
            isSuperAdmin={isSuperAdmin}
            highlighted={highlightId === item.id}
            onReact={(emoji) => react.mutate({ messageId: item.id, emoji })}
            onDeleteForMe={() => hide.mutate(item.id)}
            onDeleteForEveryone={() => remove.mutate(item.id)}
            onEdit={(text) => edit.mutate({ messageId: item.id, body: text })}
            onPin={(pinned) => pin.mutate({ messageId: item.id, pinned })}
            onReply={() => setReplyTo(item)}
            onForward={() => setForwarding(item)}
            onStar={(starred) => star.mutate({ messageId: item.id, starred })}
            onOpenProfile={(userId) => setProfileUserId(userId)}
            onVote={item.poll ? (optionIndex) => vote.mutate({ pollId: item.poll!.id, optionIndex }) : undefined}
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
        onCreatePoll={kind === "channel" ? () => setCreatingPoll(true) : undefined}
      />

      <PollComposerModal
        visible={creatingPoll}
        onCreate={async ({ question, options, multipleChoice }) => {
          await createPoll(containerId, { question, options, multipleChoice });
          setCreatingPoll(false);
          refetch();
        }}
        onClose={() => setCreatingPoll(false)}
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
  pinnedBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pinnedIcon: { fontSize: 12 },
  pinnedText: { flex: 1, fontSize: 12, color: colors.textMuted },
  typing: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    fontSize: 12,
    color: colors.textMuted,
  },
});
