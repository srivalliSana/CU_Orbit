import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Button, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useMessages } from "../../hooks/useMessages";
import { useChannelSocket } from "../../hooks/useSocket";
import { on as onSocketEvent } from "../../api/socket";
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
import { cancelScheduledMessage, createScheduledMessage, getScheduledMessages, type ScheduledMessageRow } from "../../api/scheduled";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";
import type { Message } from "../../types/api";

type Props = NativeStackScreenProps<HomeStackParamList, "Chat">;

export default function ChatScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { containerId, title, kind, scrollToMessageId } = route.params;
  const { data: messages, isLoading, error, refetch, send, react, remove, hide, edit, pin, star, vote, action } = useMessages(containerId);
  const { typingName, notifyTyping } = useTyping(containerId);
  const selfId = useAuthStore((s) => s.user?.id);
  const selfRole = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = selfRole === "admin";
  const [canModerate, setCanModerate] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledMessageRow[]>([]);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const loadScheduled = () => getScheduledMessages(containerId).then(setScheduled).catch(() => {});
  useEffect(() => { loadScheduled(); setScheduledOpen(false); }, [containerId]);
  const cancelScheduled = (id: string) => cancelScheduledMessage(id).catch(() => {}).finally(loadScheduled);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [ephemeralNotice, setEphemeralNotice] = useState<{ app_name: string; text: string } | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const pinnedMessage = messages?.find((m) => m.is_pinned);

  // Keep the newest message visible above the keyboard: scroll to the end
  // whenever the keyboard opens (about to type), and whenever a new message
  // lands that's either our own outgoing send or arrives while the keyboard
  // is already up — matches WhatsApp's "don't yank the view while the user
  // is reading old history" behavior instead of force-scrolling on every
  // incoming message.
  const keyboardVisible = useRef(false);
  const lastMessageId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => {
      keyboardVisible.current = true;
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardVisible.current = false;
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Reset per-chat scroll bookkeeping when switching to a different
  // container — otherwise a stale lastMessageId from the previous chat
  // makes the "is this actually new" check below wrong.
  const hasDoneInitialScroll = useRef(false);
  useEffect(() => {
    lastMessageId.current = undefined;
    hasDoneInitialScroll.current = false;
  }, [containerId]);

  useEffect(() => {
    const last = messages?.[messages.length - 1];
    if (!last || last.id === lastMessageId.current) return;
    lastMessageId.current = last.id;
    // Opening a channel should land on the most recent message, like
    // WhatsApp — not wherever the list defaults to (the oldest message at
    // the top). This only needs to happen once per chat open; after that,
    // scrolling is gated the normal way (own send, or keyboard already up).
    if (!hasDoneInitialScroll.current) {
      hasDoneInitialScroll.current = true;
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
      return;
    }
    if (last.sender_id === selfId || keyboardVisible.current) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages, selfId]);

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

  // A slash command's private (ephemeral) reply — never a real Message row,
  // pushed only to whoever ran the command.
  useEffect(() => {
    setEphemeralNotice(null);
    const off = onSocketEvent("ephemeral", (e: { channel_id: string; app_name: string; text: string }) => {
      if (e.channel_id !== containerId) return;
      setEphemeralNotice(e);
    });
    return off;
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
      // "padding" on iOS; "height" on Android — SDK 57's mandatory
      // edge-to-edge mode means the OS no longer auto-resizes the window
      // when the keyboard opens, so Android needs the same explicit
      // shrink-to-make-room behavior iOS gets from "padding".
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
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
            onAction={(actionId, value) => action.mutate({ messageId: item.id, actionId, value })}
            onJumpToMessage={jumpToMessage}
            currentUserId={selfId}
            onOpenDm={(chat) => navigation.push("Chat", { containerId: chat.id, title: chat.title, kind: "dm" })}
          />
        )}
        contentContainerStyle={styles.list}
      />
      {typingName ? (
        <Text style={styles.typing}>{typingName} is typing…</Text>
      ) : null}
      {ephemeralNotice ? (
        <Pressable onPress={() => setEphemeralNotice(null)} style={styles.ephemeralBanner}>
          <Text style={styles.ephemeralTag}>Only visible to you</Text>
          <Text style={styles.ephemeralText}>
            <Text style={styles.ephemeralApp}>{ephemeralNotice.app_name}: </Text>
            {ephemeralNotice.text}
          </Text>
        </Pressable>
      ) : null}
      {scheduled.length > 0 && (
        <View style={styles.scheduledBanner}>
          <Pressable onPress={() => setScheduledOpen((v) => !v)} style={styles.scheduledBannerRow}>
            <Text style={styles.scheduledBannerText}>
              🕐 {scheduled.length} message{scheduled.length === 1 ? "" : "s"} scheduled
            </Text>
            <Ionicons name={scheduledOpen ? "chevron-down" : "chevron-forward"} size={14} color={colors.textMuted} />
          </Pressable>
          {scheduledOpen && (
            <ScrollView style={styles.scheduledList}>
              {scheduled.map((s) => (
                <View key={s.id} style={styles.scheduledRow}>
                  <Text style={styles.scheduledTime}>
                    {new Date(s.send_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                  <Text style={styles.scheduledText} numberOfLines={1}>{s.body || "Attachment"}</Text>
                  <Pressable onPress={() => cancelScheduled(s.id)} hitSlop={8}>
                    <Text style={styles.scheduledCancel}>Cancel</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      <Composer
        onSend={(payload) => send.mutate(payload)}
        onSchedule={async (payload) => {
          await createScheduledMessage({ containerId, ...payload });
          loadScheduled();
        }}
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
  scheduledBanner: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  scheduledBannerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scheduledBannerText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#b45309",
  },
  scheduledList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    maxHeight: 130,
  },
  scheduledRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  scheduledTime: {
    fontSize: 11,
    color: colors.textMuted,
  },
  scheduledText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
  },
  scheduledCancel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.danger,
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
  ephemeralBanner: {
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: `${colors.primary}1a`,
  },
  ephemeralTag: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.primary,
    marginBottom: 2,
  },
  ephemeralText: {
    fontSize: 13,
    color: colors.text,
  },
  ephemeralApp: {
    fontWeight: "600",
  },
});
