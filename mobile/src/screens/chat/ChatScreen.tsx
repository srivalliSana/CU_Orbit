import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Button, FlatList, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useMessages } from "../../hooks/useMessages";
import { useChannelSocket } from "../../hooks/useSocket";
import { on as onSocketEvent } from "../../api/socket";
import { useTyping } from "../../hooks/useTyping";
import { markConversationRead, remindMessage } from "../../api/messages";
import { getChannelMembers } from "../../api/channels";
import { apiErrorMessage } from "../../api/client";
import { useAuthStore } from "../../state/authStore";
import MessageBubble from "../../components/MessageBubble";
import ActionSheet, { type ActionSheetAction } from "../../components/ActionSheet";
import Composer from "../../components/Composer";
import ForwardModal from "../../components/ForwardModal";
import UserProfileModal from "../../components/UserProfileModal";
import PollComposerModal from "../../components/PollComposerModal";
import AddToListSheet from "../../components/lists/AddToListSheet";
import EditMessageModal from "../../components/EditMessageModal";
import { createPoll } from "../../api/messages";
import { cancelScheduledMessage, createScheduledMessage, getScheduledMessages, type ScheduledMessageRow } from "../../api/scheduled";
import { getConversationPrefs, setConversationPref } from "../../api/conversations";
import { dayLabel } from "../../lib/format";
import { wallpaperColor } from "../../lib/wallpapers";
import { saveFile } from "../../lib/fileActions";
import { resolveMediaUrl } from "../../constants/config";
import { reportUser } from "../../api/users";
import WallpaperPicker from "../../components/WallpaperPicker";
import { useThemeColors, useIsDarkMode } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";
import type { Message } from "../../types/api";

type Props = NativeStackScreenProps<HomeStackParamList, "Chat">;

export default function ChatScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { containerId, title, kind, scrollToMessageId } = route.params;
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  const [wallpaperPickerOpen, setWallpaperPickerOpen] = useState(false);
  const { data: messages, isLoading, error, refetch, send, retrySend, react, remove, hide, edit, pin, star, vote, action, loadOlder, hasOlder, loadingOlder } = useMessages(containerId);
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
  // A scheduled message that fires while this screen is open becomes a real
  // message server-side, but nothing tells this list — it kept showing the
  // now-sent entry until the screen was reopened. No socket event covers
  // this case, so poll lightly, and only while there's something pending.
  useEffect(() => {
    if (!scheduled.length) return;
    const t = setInterval(loadScheduled, 15000);
    return () => clearInterval(t);
  }, [containerId, scheduled.length]);
  const cancelScheduled = (id: string) => cancelScheduledMessage(id).catch(() => {}).finally(loadScheduled);
  const [forwarding, setForwarding] = useState<Message[]>([]);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [creatingPoll, setCreatingPoll] = useState(false);

  // Long-pressing a message drops the whole screen into selection mode —
  // top/bottom bars replace the normal header/composer (see the header
  // effect and the render below) instead of a per-message popup menu.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addToListTarget, setAddToListTarget] = useState<Message | null>(null);
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const [reportTarget, setReportTarget] = useState<Message | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportSent, setReportSent] = useState(false);

  const enterSelection = (id: string) => {
    setSelectedIds(new Set([id]));
    setSelectionMode(true);
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };
  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const selectedMessages = useMemo(
    () => (messages ?? []).filter((m) => selectedIds.has(m.id)),
    [messages, selectedIds]
  );
  const singleSelected = selectedMessages.length === 1 ? selectedMessages[0] : null;
  const selectedHasMedia = selectedMessages.some(
    (m) => ["image", "video", "file"].includes(m.type) && m.attachments?.[0]?.url
  );

  const batchForward = () => {
    setForwarding(selectedMessages);
    exitSelection();
  };
  const batchStar = () => {
    selectedMessages.forEach((m) => star.mutate({ messageId: m.id, starred: true }));
    exitSelection();
  };
  const batchSave = () => {
    selectedMessages.forEach((m) => {
      const att = m.attachments?.[0];
      const url = resolveMediaUrl(att?.url);
      if (url) saveFile(url, att?.name || "file", att?.mimeType);
    });
    exitSelection();
  };
  const batchDelete = () => {
    const canDeleteAll = selectedMessages.every((m) => m.sender_id === selfId || canModerate);
    const buttons: Parameters<typeof Alert.alert>[2] = [
      {
        text: "Delete for me",
        onPress: () => {
          selectedMessages.forEach((m) => hide.mutate(m.id));
          exitSelection();
        },
      },
    ];
    if (canDeleteAll) {
      buttons.push({
        text: "Delete for everyone",
        style: "destructive",
        onPress: () => {
          selectedMessages.forEach((m) => remove.mutate(m.id));
          exitSelection();
        },
      });
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert(
      selectedMessages.length > 1 ? `Delete ${selectedMessages.length} messages?` : "Delete this message?",
      undefined,
      buttons
    );
  };
  // Long-press a single message -> this sheet, tailored to its type (Slack's
  // model: Text gets Copy, media gets Save/Copy link, everyone gets
  // Reply/Forward/Star/Pin/Remind, "Select" is the door into the multi-
  // message batch toolbar further down for forwarding/starring/deleting
  // several at once).
  const [actionSheetFor, setActionSheetFor] = useState<Message | null>(null);
  const sheetSubtitle = (m: Message) => {
    if (m.type === "text") return m.text;
    if (m.type === "poll") return m.poll?.question;
    const name = m.attachments?.[0]?.name;
    if (name) return name;
    if (m.type === "image") return "Photo";
    if (m.type === "video") return "Video";
    if (m.type === "audio") return "Voice message";
    if (m.type === "file") return "File";
    return undefined;
  };
  const buildActions = (m: Message): ActionSheetAction[] => {
    const isOwn = m.sender_id === selfId;
    const isMedia = ["image", "video", "file", "audio"].includes(m.type) && !!m.attachments?.[0]?.url;
    const canEdit = (isOwn || isSuperAdmin) && m.type === "text";
    const canReport = !isOwn;
    const canDeleteEveryone = isOwn || canModerate;
    const list: ActionSheetAction[] = [
      { key: "reply", label: "Reply", icon: "arrow-undo-outline", onPress: () => setReplyTo(m) },
    ];
    if (m.type === "text" && m.text) {
      list.push({ key: "copy", label: "Copy text", icon: "copy-outline", onPress: () => Clipboard.setStringAsync(m.text) });
    }
    if (isMedia) {
      list.push({
        key: "save",
        label: "Save to device",
        icon: "download-outline",
        onPress: () => {
          const att = m.attachments?.[0];
          const url = resolveMediaUrl(att?.url);
          if (url) saveFile(url, att?.name || "file", att?.mimeType);
        },
      });
      list.push({
        key: "copylink",
        label: "Copy link",
        icon: "link-outline",
        onPress: () => {
          const url = resolveMediaUrl(m.attachments?.[0]?.url);
          if (url) Clipboard.setStringAsync(url);
        },
      });
    }
    list.push({ key: "forward", label: "Forward", icon: "arrow-redo-outline", onPress: () => setForwarding([m]) });
    list.push({
      key: "star",
      label: m.is_starred ? "Unstar" : "Star",
      icon: m.is_starred ? "star" : "star-outline",
      onPress: () => star.mutate({ messageId: m.id, starred: !m.is_starred }),
    });
    list.push({
      key: "pin",
      label: m.is_pinned ? "Unpin" : "Pin to chat",
      icon: m.is_pinned ? "pin" : "pin-outline",
      onPress: () => pin.mutate({ messageId: m.id, pinned: !m.is_pinned }),
    });
    if (m.channel_id) {
      list.push({ key: "addtolist", label: "Add to list", icon: "list-outline", onPress: () => setAddToListTarget(m) });
    }
    list.push({
      key: "remind",
      label: "Remind me",
      icon: "alarm-outline",
      onPress: () => {
        Alert.alert("Remind me", undefined, [
          { text: "In 1 hour", onPress: () => remindMessage(m.id, 60).catch(() => {}) },
          { text: "In 3 hours", onPress: () => remindMessage(m.id, 180).catch(() => {}) },
          { text: "Tomorrow", onPress: () => remindMessage(m.id, 24 * 60).catch(() => {}) },
          { text: "Cancel", style: "cancel" },
        ]);
      },
    });
    if (canEdit) {
      list.push({ key: "edit", label: "Edit message", icon: "pencil-outline", onPress: () => setEditTarget(m) });
    }
    list.push({ key: "select", label: "Select", icon: "checkmark-circle-outline", onPress: () => enterSelection(m.id) });
    if (canReport) {
      list.push({ key: "report", label: "Report", icon: "flag-outline", destructive: true, onPress: () => setReportTarget(m) });
    }
    list.push({
      key: "delete",
      label: "Delete",
      icon: "trash-outline",
      destructive: true,
      onPress: () => {
        const buttons: Parameters<typeof Alert.alert>[2] = [
          { text: "Delete for me", onPress: () => hide.mutate(m.id) },
        ];
        if (canDeleteEveryone) {
          buttons.push({ text: "Delete for everyone", style: "destructive", onPress: () => remove.mutate(m.id) });
        }
        buttons.push({ text: "Cancel", style: "cancel" });
        Alert.alert("Delete this message?", undefined, buttons);
      },
    });
    return list;
  };
  const submitReport = async () => {
    if (!reportTarget) return;
    try {
      await reportUser(reportTarget.sender_id, reportReason.trim(), reportTarget.id);
      setReportSent(true);
      setTimeout(() => { setReportTarget(null); setReportSent(false); setReportReason(""); }, 1500);
    } catch {
      // best-effort — the report either lands or it doesn't
    }
  };
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [ephemeralNotice, setEphemeralNotice] = useState<{ app_name: string; text: string } | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const [pinnedDismissed, setPinnedDismissed] = useState(false);
  const pinnedMessage = pinnedDismissed ? undefined : messages?.find((m) => m.is_pinned);
  useEffect(() => { setPinnedDismissed(false); }, [containerId]);

  // Keep the newest message visible above the keyboard: scroll to the end
  // whenever the keyboard opens (about to type), and whenever a new message
  // lands that's either our own outgoing send or arrives while the keyboard
  // is already up — matches WhatsApp's "don't yank the view while the user
  // is reading old history" behavior instead of force-scrolling on every
  // incoming message.
  const keyboardVisible = useRef(false);
  const lastMessageId = useRef<string | undefined>(undefined);
  // KeyboardStickyView's native-insets translation left a visible gap
  // under Android edge-to-edge (its reported keyboard height didn't line
  // up with where the keyboard actually starts, by roughly a nav-bar's
  // worth) — no offset tweak closed it reliably. This instead reads the
  // OS's own authoritative keyboard height from the plain Keyboard module
  // (already used here for scroll-to-end) and applies it as marginBottom
  // on the composer directly: the same number Android itself reports,
  // zero translation math to get wrong.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e) => {
      keyboardVisible.current = true;
      setKeyboardHeight(e.endCoordinates.height);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardVisible.current = false;
      setKeyboardHeight(0);
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

  const [memberCount, setMemberCount] = useState<number | null>(null);

  // "ADMIN: delete messages in own channels (from anyone)" — a channel's
  // own admin qualifies only for that channel; a workspace admin always does.
  useEffect(() => {
    if (kind !== "channel") { setCanModerate(isSuperAdmin); return; }
    let cancelled = false;
    getChannelMembers(containerId)
      .then((members) => {
        if (cancelled) return;
        setMemberCount(members.length);
        const me = members.find((m) => m.id === selfId);
        setCanModerate(isSuperAdmin || me?.role === "admin");
      })
      .catch(() => setCanModerate(isSuperAdmin));
    return () => { cancelled = true; };
  }, [containerId, kind, selfId, isSuperAdmin]);

  // DM containers are addressed as "<idA>_<idB>" sorted — the other
  // participant is whichever half of that isn't the signed-in user, so no
  // extra lookup is needed to know who this chat is with.
  const otherUserId = kind === "dm" ? containerId.split("_").find((id) => id !== selfId) : undefined;

  useEffect(() => {
    if (selectionMode) {
      // Every action lives in the long-press sheet now — this bar is just
      // the multi-message batch mode ("Select" in that sheet gets here),
      // so the header stays plain: a count and a way out.
      navigation.setOptions({
        headerTitle: () => (
          <Text style={styles.headerTitleText}>{selectedIds.size} selected</Text>
        ),
        headerLeft: () => (
          <Pressable onPress={exitSelection} hitSlop={8} style={{ marginRight: 4 }}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        ),
        headerRight: () => null,
      });
      return;
    }

    // WhatsApp-style: the whole header title area (name + subtitle) is one
    // tap target to open channel/contact info — previously only the small ⓘ
    // icon in headerRight did this, which meant hunting for a tiny target.
    const openInfo = () => {
      if (kind === "channel") navigation.navigate("ChannelInfo", { channelId: containerId });
      else if (kind === "dm" && otherUserId) navigation.navigate("ContactInfo", { userId: otherUserId, name: title, containerId });
    };
    const canOpenInfo = kind === "channel" || (kind === "dm" && !!otherUserId);

    navigation.setOptions({
      title,
      headerLeft: undefined,
      headerTitle: () => (
        <Pressable onPress={canOpenInfo ? openInfo : undefined} disabled={!canOpenInfo} hitSlop={8}>
          <Text style={styles.headerTitleText} numberOfLines={1}>{title}</Text>
          {kind === "channel" && memberCount != null ? (
            <Text style={styles.headerSubtitleText} numberOfLines={1}>
              {memberCount} member{memberCount === 1 ? "" : "s"}
            </Text>
          ) : null}
        </Pressable>
      ),
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable onPress={() => setWallpaperPickerOpen(true)} hitSlop={8}>
            <Ionicons name="color-palette-outline" size={22} color={colors.primary} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, title, kind, containerId, otherUserId, memberCount, selectionMode, selectedIds]);

  // Switching chats, or the last selected message getting removed out from
  // under the selection, should never leave a stale selection bar up.
  useEffect(() => { exitSelection(); }, [containerId]);

  useEffect(() => {
    markConversationRead(containerId);
  }, [containerId]);

  useEffect(() => {
    setWallpaperPickerOpen(false);
    getConversationPrefs(containerId)
      .then((p) => setWallpaper(p?.wallpaper || null))
      .catch(() => setWallpaper(null));
  }, [containerId]);

  const pickWallpaper = (key: string | null) => {
    setWallpaper(key);
    setWallpaperPickerOpen(false);
    setConversationPref(containerId, "wallpaper", key).catch(() => {});
  };

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
    <View style={styles.flex}>
      {pinnedMessage ? (
        <View style={styles.pinnedBar}>
          <Pressable style={styles.pinnedTap} onPress={() => jumpToMessage(pinnedMessage.id)}>
            <Ionicons name="pin" size={14} color={colors.primary} />
            <Text style={styles.pinnedText} numberOfLines={1}>
              {pinnedMessage.text || (pinnedMessage.type === "poll" ? pinnedMessage.poll?.question : "Attachment")}
            </Text>
          </Pressable>
          <Pressable onPress={() => setPinnedDismissed(true)} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={messages}
        style={wallpaperColor(wallpaper, isDark) ? { backgroundColor: wallpaperColor(wallpaper, isDark)! } : undefined}
        keyExtractor={(m) => m.id}
        // The list isn't inverted (renders oldest-at-top, newest-at-bottom,
        // same as it always has), so "load older" triggers on scrolling
        // near the TOP, not FlatList's built-in onEndReached (that's the
        // bottom). maintainVisibleContentPosition keeps whatever the user
        // was looking at in place once older messages get prepended above
        // it, instead of the view jumping.
        onScroll={({ nativeEvent }) => {
          if (nativeEvent.contentOffset.y < 80 && hasOlder && !loadingOlder) loadOlder();
        }}
        scrollEventThrottle={200}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        ListHeaderComponent={
          loadingOlder ? (
            <View style={{ paddingVertical: 14, alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : null
        }
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
        renderItem={({ item, index }) => {
          const prev = messages?.[index - 1];
          const showDivider = !prev || dayLabel(prev.sent_at) !== dayLabel(item.sent_at);
          return (
            <>
              {showDivider ? (
                <View style={styles.dateDividerRow}>
                  <Text style={styles.dateDividerText}>{dayLabel(item.sent_at)}</Text>
                </View>
              ) : null}
              <MessageBubble
                message={item}
                isOwn={item.sender_id === selfId}
                showSenderInfo={showDivider || prev?.sender_id !== item.sender_id}
                isGroup={kind === "channel"}
                highlighted={highlightId === item.id}
                onReact={(emoji) => react.mutate({ messageId: item.id, emoji })}
                onReply={() => setReplyTo(item)}
                onOpenProfile={(userId) => setProfileUserId(userId)}
                onVote={item.poll ? (optionIndex) => vote.mutate({ pollId: item.poll!.id, optionIndex }) : undefined}
                onAction={(actionId, value) => action.mutate({ messageId: item.id, actionId, value })}
                onJumpToMessage={jumpToMessage}
                currentUserId={selfId}
                onOpenDm={(chat) => navigation.push("Chat", { containerId: chat.id, title: chat.title, kind: "dm" })}
                selectionMode={selectionMode}
                selected={selectedIds.has(item.id)}
                showReactionBar={selectionMode && selectedIds.size === 1 && selectedIds.has(item.id)}
                onEnterSelection={() => setActionSheetFor(item)}
                onToggleSelect={() => toggleSelect(item.id)}
                onRetry={() => retrySend(item)}
              />
            </>
          );
        }}
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

      <View style={{ marginBottom: keyboardHeight }}>
      {selectionMode ? (
        <View style={styles.selectionBar}>
          <Pressable style={styles.selectionBarAction} onPress={batchForward}>
            <Ionicons name="arrow-redo-outline" size={21} color={colors.text} />
            <Text style={styles.selectionBarActionText}>Forward</Text>
          </Pressable>
          <Pressable style={styles.selectionBarAction} onPress={batchStar}>
            <Ionicons name="star-outline" size={21} color={colors.text} />
            <Text style={styles.selectionBarActionText}>Star</Text>
          </Pressable>
          {selectedHasMedia ? (
            <Pressable style={styles.selectionBarAction} onPress={batchSave}>
              <Ionicons name="download-outline" size={21} color={colors.primary} />
              <Text style={[styles.selectionBarActionText, { color: colors.primary }]}>Save</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.selectionBarAction} onPress={batchDelete}>
            <Ionicons name="trash-outline" size={21} color={colors.danger} />
            <Text style={[styles.selectionBarActionText, { color: colors.danger }]}>Delete</Text>
          </Pressable>
        </View>
      ) : (
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
      )}
      </View>

      <PollComposerModal
        visible={creatingPoll}
        onCreate={async ({ question, options, multipleChoice, quizMode, correctOptionIndex, optionImages }) => {
          await createPoll(containerId, { question, options, multipleChoice, quizMode, correctOptionIndex, optionImages });
          setCreatingPoll(false);
          refetch();
        }}
        onClose={() => setCreatingPoll(false)}
      />

      <ActionSheet
        visible={!!actionSheetFor}
        title={actionSheetFor?.sender_name ?? ""}
        subtitle={actionSheetFor ? sheetSubtitle(actionSheetFor) : undefined}
        actions={actionSheetFor ? buildActions(actionSheetFor) : []}
        onClose={() => setActionSheetFor(null)}
      />

      <ForwardModal
        messages={forwarding}
        visible={forwarding.length > 0}
        onClose={() => setForwarding([])}
        onForwarded={() => setForwarding([])}
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

      <WallpaperPicker
        visible={wallpaperPickerOpen}
        current={wallpaper}
        onPick={pickWallpaper}
        onClose={() => setWallpaperPickerOpen(false)}
      />

      {addToListTarget?.channel_id ? (
        <AddToListSheet
          visible={!!addToListTarget}
          channelId={addToListTarget.channel_id}
          messageId={addToListTarget.id}
          messageText={addToListTarget.text}
          onClose={() => setAddToListTarget(null)}
        />
      ) : null}

      <EditMessageModal
        visible={!!editTarget}
        initialText={editTarget?.text ?? ""}
        onSave={(text) => { if (editTarget) edit.mutate({ messageId: editTarget.id, body: text }); }}
        onClose={() => setEditTarget(null)}
      />

      <Modal visible={!!reportTarget} transparent animationType="fade" onRequestClose={() => setReportTarget(null)}>
        <Pressable style={styles.reportBackdrop} onPress={() => setReportTarget(null)}>
          <Pressable style={styles.reportCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.reportTitle}>Report {reportTarget?.sender_name}</Text>
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
                <View style={styles.reportActions}>
                  <Pressable onPress={() => setReportTarget(null)} style={styles.reportCancel}>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={submitReport} style={styles.reportSend}>
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Send report</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  headerSubtitleText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  selectionBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  selectionBarAction: {
    alignItems: "center",
    gap: 3,
  },
  selectionBarActionText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.text,
  },
  reportBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  reportCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  reportInput: {
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
  reportSentText: {
    color: colors.primary,
    fontSize: 14,
    marginTop: 12,
  },
  reportActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  reportCancel: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  reportSend: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: colors.danger,
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
  dateDividerRow: {
    alignItems: "center",
    marginVertical: 10,
  },
  dateDividerText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: "hidden",
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
  pinnedTap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
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
