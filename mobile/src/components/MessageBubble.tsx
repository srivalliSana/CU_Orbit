import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useCustomEmojiMap } from "./EmojiPicker";
import Avatar from "./Avatar";
import LinkPreviewCard from "./LinkPreviewCard";
import { renderMarkdown, renderMessageText } from "../lib/markdown";
import { openFile, saveFile } from "../lib/fileActions";
import { getReads } from "../api/messages";
import { resolveMediaUrl } from "../constants/config";
import { clockLabel } from "../lib/format";
import { useThemeColors } from "../state/themeStore";
import type { Message } from "../types/api";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** File-type icon for the attachment card — cosmetic only. */
function fileIconFor(name: string, mimeType?: string | null): keyof typeof Ionicons.glyphMap {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf" || mimeType === "application/pdf") return "document-text";
  if (["doc", "docx"].includes(ext)) return "document-text";
  if (["xls", "xlsx", "csv"].includes(ext)) return "grid";
  if (["ppt", "pptx"].includes(ext)) return "easel";
  if (["zip", "rar", "7z"].includes(ext)) return "archive";
  return "document";
}

/** A short, common-case guess only — used purely for a display label when
 *  the real filename is unrecoverable, never for anything functional. */
function mimeExtension(mimeType?: string | null): string | null {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/zip": "zip",
    "text/plain": "txt",
  };
  return mimeType ? map[mimeType] || null : null;
}

export default function MessageBubble({
  message,
  isOwn,
  isGroup,
  onReact,
  onReply,
  onOpenProfile,
  onVote,
  onAction,
  onJumpToMessage,
  highlighted,
  currentUserId,
  onOpenDm,
  showSenderInfo = true,
  selectionMode = false,
  selected = false,
  showReactionBar = false,
  onEnterSelection,
  onToggleSelect,
}: {
  message: Message;
  isOwn: boolean;
  isGroup?: boolean;
  highlighted?: boolean;
  // Avatar + sender name show once per consecutive run of messages from
  // the same sender (the classic WhatsApp/Telegram grouping), not on
  // every single message — the caller (ChatScreen) knows the neighboring
  // messages and passes this down; defaults true so every other call site
  // that doesn't bother with grouping still gets correct behavior.
  showSenderInfo?: boolean;
  onReact: (emoji: string) => void;
  onReply?: () => void;
  onOpenProfile?: (userId: string) => void;
  onVote?: (optionIndex: number) => void;
  onAction?: (actionId: string, value: string | undefined) => void;
  onJumpToMessage?: (messageId: string) => void;
  currentUserId?: string;
  onOpenDm?: (chat: { id: string; kind: "dm"; title: string }) => void;
  // Long-press drops the whole chat into selection mode (ChatScreen owns
  // the selected-id set and renders the top/bottom action bars) instead of
  // opening a per-message popup — see ChatScreen for the bars themselves.
  // showReactionBar is true only while this is the sole selected message,
  // matching WhatsApp: the quick-react row disappears once a second
  // message is added to the selection.
  selectionMode?: boolean;
  selected?: boolean;
  showReactionBar?: boolean;
  onEnterSelection?: () => void;
  onToggleSelect?: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [videoViewerVisible, setVideoViewerVisible] = useState(false);
  const [votesVisible, setVotesVisible] = useState(false);

  // "Seen by" — group messages only, own messages only, mirrors web's
  // showReads. A DM's status already reads "read"/"delivered"/"sent"
  // directly off the message (set server-side), so there's nothing to
  // fetch there — tapping only does something in a group.
  const showReads = async () => {
    if (!isOwn || !isGroup) return;
    try {
      const reads = await getReads(message.id);
      Alert.alert(
        `Read by ${reads.read_count}${reads.audience ? ` of ${reads.audience}` : ""}`,
        reads.readers.length ? reads.readers.map((r) => r.name).join("\n") : "No one has read this yet."
      );
    } catch {
      Alert.alert("Couldn't load read receipts");
    }
  };
  const customEmojiMap = useCustomEmojiMap();

  // WhatsApp-style swipe-right-to-reply: drag reveals a reply icon behind
  // the bubble; releasing past REPLY_THRESHOLD fires onReply, otherwise it
  // springs back. Disabled (no-op) when the caller doesn't support replying
  // (e.g. inside a thread detail view).
  const translateX = useSharedValue(0);
  const REPLY_THRESHOLD = 56;
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!!onReply && !selectionMode)
        .activeOffsetX([-1000, 10])
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
          translateX.value = Math.max(0, Math.min(e.translationX, 80));
        })
        .onEnd(() => {
          if (translateX.value > REPLY_THRESHOLD && onReply) {
            runOnJS(onReply)();
          }
          translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onReply, selectionMode]
  );
  const swipeBubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const swipeIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, REPLY_THRESHOLD], [0, 1], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(translateX.value, [0, REPLY_THRESHOLD], [0.5, 1], Extrapolation.CLAMP) },
    ],
  }));

  // A plain Pressable's onLongPress nested under a GestureDetector's Pan
  // gesture is unreliable — RNGH's native recognizer can claim the touch
  // before the long-press timer fires, so a long-press was frequently lost
  // (reported as "long-press not working"). Gesture.Race arbitrates it
  // properly: holding still long enough wins the long-press, moving past
  // the pan's activation offset first wins the swipe. Attached to the
  // whole row (not just the bubble) so long-pressing the empty gutter
  // beside a message opens the picker too.
  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(350)
        .onStart(() => {
          if (onEnterSelection) runOnJS(onEnterSelection)();
        }),
    [onEnterSelection]
  );
  const rowGesture = useMemo(() => Gesture.Race(swipeGesture, longPressGesture), [swipeGesture, longPressGesture]);

  const reactionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of message.reactions) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
    return [...counts.entries()];
  }, [message.reactions]);

  if (message.type === "system") {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.text}</Text>
      </View>
    );
  }

  const attachmentUrl = resolveMediaUrl(message.attachments?.[0]?.url);
  // The server stores files under a timestamp-prefixed name to avoid
  // collisions on disk — attachments[0].name is the sender's original
  // filename, shown/saved instead of "1755000000000-report.pdf". Messages
  // sent before the upload endpoint accepted a real filename (see
  // api/upload.ts) may still have a raw generated name like a UUID stored
  // — that can't be recovered after the fact, so at least don't show the
  // ugly raw value for those.
  const rawFileName = message.attachments?.[0]?.name || attachmentUrl?.split("/").pop() || "file";
  const mimeType = message.attachments?.[0]?.mimeType;
  const looksGenerated = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(rawFileName);
  const fileName = looksGenerated ? `Document${mimeExtension(mimeType) ? `.${mimeExtension(mimeType)}` : ""}` : rawFileName;

  const handleOpen = () => {
    if (!attachmentUrl) return;
    openFile(attachmentUrl, fileName, mimeType);
  };

  const handleSave = () => {
    if (!attachmentUrl) return;
    saveFile(attachmentUrl, fileName, mimeType || (message.type === "image" ? "image/jpeg" : message.type === "video" ? "video/mp4" : undefined));
  };

  const handleTap = () => {
    if (selectionMode) onToggleSelect?.();
  };

  return (
    <GestureDetector gesture={rowGesture}>
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther, !showSenderInfo && styles.rowGrouped, selectionMode && styles.rowSelecting]}>
      {message.is_pinned ? <Text style={styles.pinnedLabel}>📌 Pinned</Text> : null}
      <View style={styles.incomingLayout}>
        {!isOwn ? (
          <View style={styles.avatarGutter}>
            {showSenderInfo ? (
              <Pressable onPress={() => onOpenProfile?.(message.sender_id)}>
                <Avatar name={message.sender_name} url={message.sender_avatar_url} size={36} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={styles.bubbleColumn}>
          {!isOwn && showSenderInfo ? (
            <Pressable onPress={() => onOpenProfile?.(message.sender_id)} hitSlop={4}>
              <Text style={styles.senderName}>{message.sender_name}</Text>
            </Pressable>
          ) : null}
        <View style={styles.swipeWrap}>
          <Animated.View style={[styles.swipeReplyIcon, swipeIconStyle]}>
            <Ionicons name="arrow-undo" size={18} color={colors.primary} />
          </Animated.View>
          <Animated.View style={swipeBubbleStyle}>
      <Pressable
        onPress={handleTap}
        style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther, highlighted && styles.bubbleHighlighted, selected && styles.bubbleSelected]}
      >
        {message.forwarded_from ? (
          <Text style={styles.forwardedLabel}>➡️ Forwarded from {message.forwarded_from.sender_name}</Text>
        ) : null}

        {message.reply_to ? (
          <Pressable
            onPress={() => onJumpToMessage?.(message.reply_to!.id)}
            style={styles.replyQuote}
          >
            <Text style={styles.replyQuoteSender}>{message.reply_to.sender_name}</Text>
            <Text style={styles.replyQuoteText} numberOfLines={1}>
              {message.reply_to.text ? renderMarkdown(message.reply_to.text, styles.link) : "Attachment"}
            </Text>
          </Pressable>
        ) : null}

        {message.type === "poll" && message.poll ? (
          <View style={styles.pollBox}>
            <Text style={styles.pollQuestion}>📊 {message.poll.question}</Text>
            {message.poll.options.map((opt, i) => {
              const count = message.poll!.counts[i] ?? 0;
              const pct = message.poll!.total_votes ? Math.round((count / message.poll!.total_votes) * 100) : 0;
              const mine = (message.poll!.my_votes ?? []).includes(i);
              const optionVoters = message.poll!.voters?.[i] ?? [];
              const shown = optionVoters.slice(0, 3);
              const extra = optionVoters.length - shown.length;
              return (
                <Pressable
                  key={i}
                  disabled={message.poll!.closed}
                  onPress={() => onVote?.(i)}
                  style={styles.pollOption}
                >
                  <View style={[styles.pollOptionFill, { width: `${pct}%` }]} />
                  <Text style={[styles.pollOptionText, mine && styles.pollOptionTextMine]} numberOfLines={1}>
                    {mine ? "✓ " : ""}{opt}
                  </Text>
                  <View style={styles.pollOptionRight}>
                    {shown.length > 0 ? (
                      <View style={styles.voterStack}>
                        {shown.map((v, vi) => (
                          <View key={v.id} style={[styles.voterStackAvatar, vi > 0 && styles.voterStackAvatarOverlap]}>
                            <Avatar name={v.name} url={v.avatarUrl} size={18} />
                          </View>
                        ))}
                        {extra > 0 ? (
                          <View style={[styles.voterStackExtra, styles.voterStackAvatarOverlap]}>
                            <Text style={styles.voterStackExtraText}>+{extra}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                    <Text style={styles.pollOptionPct}>{count}</Text>
                  </View>
                </Pressable>
              );
            })}
            <Text style={styles.pollMeta}>
              {message.poll.total_votes} vote{message.poll.total_votes === 1 ? "" : "s"}
              {message.poll.multiple_choice ? " · Select one or more" : " · Select one"}
            </Text>
            {message.poll.total_votes > 0 ? (
              <Pressable onPress={() => setVotesVisible(true)}>
                <Text style={styles.pollViewVotes}>View votes</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {message.poll ? (
          <Modal visible={votesVisible} transparent animationType="fade" onRequestClose={() => setVotesVisible(false)}>
            <Pressable style={styles.votesBackdrop} onPress={() => setVotesVisible(false)}>
              <Pressable style={styles.votesCard} onPress={(e) => e.stopPropagation()}>
                <Text style={styles.votesQuestion}>{message.poll.question}</Text>
                <Text style={styles.votesSubtitle}>
                  {message.poll.voted_members} of {message.poll.total_members} member{message.poll.total_members === 1 ? "" : "s"} voted
                </Text>
                <ScrollView style={styles.votesScroll}>
                  {message.poll.options.map((opt, i) => {
                    const count = message.poll!.counts[i] ?? 0;
                    const optionVoters = message.poll!.voters?.[i] ?? [];
                    return (
                      <View key={i} style={styles.votesGroup}>
                        <View style={styles.votesGroupHeader}>
                          <Text style={styles.votesOptionText} numberOfLines={1}>{opt}</Text>
                          <Text style={styles.votesCount}>{count} vote{count === 1 ? "" : "s"}</Text>
                        </View>
                        {optionVoters.length > 0 ? (
                          optionVoters.map((v) => (
                            <View key={v.id} style={styles.voterRow}>
                              <Avatar name={v.name} url={v.avatarUrl} size={22} />
                              <Text style={styles.voterName} numberOfLines={1}>{v.name}</Text>
                            </View>
                          ))
                        ) : (
                          <Text style={styles.voterEmpty}>No votes yet</Text>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}

        {message.type === "image" && attachmentUrl ? (
          <Pressable onPress={() => (selectionMode ? onToggleSelect?.() : setImageViewerVisible(true))}>
            <Image source={{ uri: attachmentUrl }} style={styles.image} resizeMode="cover" />
          </Pressable>
        ) : message.type === "video" && attachmentUrl ? (
          // Tapping opens a dedicated fullscreen viewer (below) instead of
          // relying on the inline player's own fullscreen toggle — that
          // toggle sits inside this same long-press GestureDetector's touch
          // area and taps on it were landing on the row's gesture instead
          // of the native video controls, which is also why "Save" via
          // long-press never fired here (same gesture, different handler,
          // the outer one always won). A tap now reliably opens a bigger
          // player with an explicit Save button, matching the image viewer.
          <Pressable onPress={() => (selectionMode ? onToggleSelect?.() : setVideoViewerVisible(true))}>
            <VideoBubble uri={attachmentUrl} style={styles.image} controls={false} />
            <View style={styles.videoPlayOverlay} pointerEvents="none">
              <Ionicons name="play-circle" size={44} color="#fff" />
            </View>
          </Pressable>
        ) : message.type === "voice" && attachmentUrl ? (
          <VoiceBubble uri={attachmentUrl} styles={styles} />
        ) : message.type === "file" && attachmentUrl ? (
          <Pressable onPress={() => (selectionMode ? onToggleSelect?.() : handleOpen())} style={styles.fileCard}>
            <View style={styles.fileIconChip}>
              <Ionicons name={fileIconFor(fileName, mimeType)} size={20} color={colors.primary} />
            </View>
            <Text style={[styles.fileText, isOwn && styles.textOwn]} numberOfLines={1}>
              {fileName}
            </Text>
          </Pressable>
        ) : null}

        {message.text && message.type !== "poll" ? (
          <Text style={[styles.text, isOwn && styles.textOwn]}>
            {renderMessageText(
              message.text,
              styles.link,
              styles.mentionChip,
              message.enriched_mentions,
              (mention) => {
                if (!mention.user_id || !currentUserId || mention.user_id === currentUserId) return;
                const dmId = [currentUserId, mention.user_id].sort().join("_");
                onOpenDm?.({ id: dmId, kind: "dm", title: mention.display_name });
              }
            )}
          </Text>
        ) : null}

        {message.text && message.type === "text" ? <LinkPreviewCard text={message.text} /> : null}

        <ActionButtonsRow message={message} isOwn={isOwn} onAction={onAction} styles={styles} colors={colors} />

        <Pressable onPress={showReads} disabled={!isOwn || !isGroup} style={styles.metaRow}>
          {message.edited_at ? <Text style={[styles.edited, isOwn && styles.textOwn]}>edited</Text> : null}
          <Text style={[styles.time, isOwn && styles.textOwn]}>{clockLabel(message.sent_at)}</Text>
          {isOwn ? (
            <Ionicons
              name={message.status === "sent" ? "checkmark" : "checkmark-done"}
              size={13}
              color={message.status === "read" ? "#60A5FA" : "#FFFFFF"}
            />
          ) : null}
        </Pressable>

        {reactionCounts.length > 0 ? (
          <View style={styles.reactionsRow}>
            {reactionCounts.map(([emoji, count]) => {
              const customUrl = customEmojiMap.get(emoji);
              return (
                <Pressable
                  key={emoji}
                  style={[styles.reactionChip, { flexDirection: "row", alignItems: "center", gap: 3 }]}
                  onPress={() => onReact(emoji)}
                  onLongPress={() => {
                    const names = message.reactions.filter((r) => r.emoji === emoji).map((r) => r.userName);
                    Alert.alert(emoji, names.join("\n"));
                  }}
                >
                  {customUrl ? (
                    <Image source={{ uri: customUrl }} style={{ width: 14, height: 14 }} />
                  ) : (
                    <Text style={styles.reactionText}>{emoji}</Text>
                  )}
                  {count > 1 ? <Text style={styles.reactionText}>{count}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Pressable>

      {showReactionBar ? (
        <View style={[styles.reactionBarFloating, isOwn ? styles.reactionBarFloatingOwn : styles.reactionBarFloatingOther]}>
          {QUICK_EMOJIS.map((emoji) => (
            <Pressable key={emoji} style={styles.reactionBarButton} onPress={() => onReact(emoji)}>
              <Text style={styles.reactionBarEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
          </Animated.View>
        </View>
        </View>
      </View>

      {selectionMode ? (
        <View style={[styles.checkmark, selected ? styles.checkmarkOn : styles.checkmarkOff, isOwn ? styles.checkmarkOwn : styles.checkmarkOther]}>
          {selected ? <Ionicons name="checkmark" size={13} color="#06130D" /> : null}
        </View>
      ) : null}

      {message.type === "image" && attachmentUrl ? (
        <Modal
          visible={imageViewerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setImageViewerVisible(false)}
        >
          <Pressable style={styles.viewerBackdrop} onPress={() => setImageViewerVisible(false)}>
            <Image source={{ uri: attachmentUrl }} style={styles.viewerImage} resizeMode="contain" />
            <Pressable style={styles.viewerSaveButton} onPress={handleSave}>
              <Text style={styles.viewerSaveText}>Save image</Text>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {message.type === "video" && attachmentUrl ? (
        <Modal
          visible={videoViewerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setVideoViewerVisible(false)}
        >
          <View style={styles.viewerBackdrop}>
            <Pressable style={styles.viewerCloseButton} onPress={() => setVideoViewerVisible(false)} hitSlop={10}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
            <VideoBubble uri={attachmentUrl} style={styles.viewerVideo} />
            <Pressable style={styles.viewerSaveButton} onPress={handleSave}>
              <Text style={styles.viewerSaveText}>Save video</Text>
            </Pressable>
          </View>
        </Modal>
      ) : null}
    </View>
    </GestureDetector>
  );
}

// A separate component (not inlined in MessageBubble) so useVideoPlayer —
// which must run unconditionally, same order every render — only mounts for
// rows that are actually a video, instead of needing a guard inside a hook.
function VideoBubble({ uri, style, controls = true }: { uri: string; style: object; controls?: boolean }) {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      player={player}
      style={style}
      nativeControls={controls}
      fullscreenOptions={{ enable: controls }}
    />
  );
}

function VoiceBubble({ uri, styles }: { uri: string; styles: ReturnType<typeof makeStyles> }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const seconds = Math.round((status.playing ? status.currentTime : status.duration) || 0);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  return (
    <Pressable
      style={styles.voiceRow}
      onPress={() => (status.playing ? player.pause() : player.play())}
    >
      <View style={styles.voicePlayButton}>
        <Text style={styles.voicePlayIcon}>{status.playing ? "⏸" : "▶"}</Text>
      </View>
      <View style={styles.voiceTrack}>
        <View style={[styles.voiceTrackFill, { width: `${status.duration ? (status.currentTime / status.duration) * 100 : 0}%` }]} />
      </View>
      <Text style={styles.voiceDuration}>{`${m}:${String(s).padStart(2, "0")}`}</Text>
    </Pressable>
  );
}

/** A bot's interactive buttons — an "actions" attachment block. Tapping one
 *  forwards the click to the owning app and, if it answers with new text/
 *  buttons, the message updates in place via the normal message list
 *  refresh (the caller's onAction already invalidates on success). */
function ActionButtonsRow({
  message,
  isOwn,
  onAction,
  styles,
  colors,
}: {
  message: Message;
  isOwn: boolean;
  onAction?: (actionId: string, value: string | undefined) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const block = message.attachments?.find((a) => a.type === "actions");
  if (!block?.buttons?.length || !onAction) return null;

  const press = (button: NonNullable<typeof block.buttons>[number]) => {
    setBusyId(button.action_id);
    Promise.resolve(onAction(button.action_id, button.value)).finally(() => setBusyId(null));
  };

  return (
    <View style={styles.actionsRow}>
      {block.buttons.map((b) => {
        const bg = b.style === "danger" ? "#dc2626" : b.style === "primary" ? colors.primary : isOwn ? "rgba(255,255,255,0.2)" : colors.background;
        const fg = b.style === "danger" || b.style === "primary" ? "#fff" : isOwn ? "#fff" : colors.text;
        return (
          <Pressable key={b.action_id} onPress={() => press(b)} disabled={busyId === b.action_id} style={[styles.actionButton, { backgroundColor: bg }]}>
            {busyId === b.action_id ? <ActivityIndicator size="small" color={fg} /> : <Text style={[styles.actionButtonText, { color: fg }]}>{b.text}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  row: {
    marginVertical: 6,
    paddingHorizontal: 16,
    // The selection checkmark is an absolutely-positioned child of this
    // row — without a position here it escapes to the nearest *actually*
    // positioned ancestor (none, upstream of the FlatList), so instead of
    // sitting next to its own bubble it floated pinned near the top of the
    // whole scroll area, detached from every message under it.
    position: "relative",
  },
  // Extra side padding while selecting, so the checkmark gets its own
  // dedicated space instead of overlapping the avatar or sitting half off
  // the screen edge in the same 16px margin everything else already uses.
  rowSelecting: {
    paddingHorizontal: 40,
  },
  // Grouped = a consecutive message from the same sender, same day — sits
  // much closer to the one above it than a new sender/first message does.
  rowGrouped: {
    marginTop: -4,
  },
  rowOwn: {
    alignItems: "flex-end",
  },
  rowOther: {
    alignItems: "flex-start",
  },
  incomingLayout: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  avatarGutter: {
    width: 36,
  },
  // A fixed pixel cap, not a percentage: this sits inside a chain of
  // nested flex-row wrappers (incomingLayout > bubbleColumn > swipeWrap >
  // bubble) with no single ancestor carrying a definite width, so a
  // percentage maxWidth anywhere in that chain has nothing real to
  // resolve against — RN's layout engine collapses it to near-zero,
  // which is what wrapped "Hello" into "Hel/lo" one letter-run per line.
  bubbleColumn: {
    maxWidth: Dimensions.get("window").width * 0.72,
  },
  pinnedLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 2,
  },
  swipeWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  swipeReplyIcon: {
    position: "absolute",
    left: -30,
    top: "50%",
    marginTop: -12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleOwn: {
    backgroundColor: colors.bubbleSelf,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.bubbleOther,
    borderBottomLeftRadius: 4,
  },
  bubbleHighlighted: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  senderName: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 2,
  },
  forwardedLabel: {
    fontSize: 11,
    fontStyle: "italic",
    color: colors.textMuted,
    marginBottom: 2,
  },
  replyQuote: {
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
  replyQuoteSender: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
  },
  replyQuoteText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  text: {
    fontSize: 15,
    color: colors.text,
  },
  // Own-message bubble is a solid dark accent fill (matches web exactly) —
  // colors.text assumes a bubble pale enough for dark text, which doesn't
  // hold here, so own messages need white text specifically.
  textOwn: {
    color: "#FFFFFF",
  },
  link: {
    color: colors.primary,
    textDecorationLine: "underline",
  },
  mentionChip: {
    color: colors.primary,
    fontWeight: "700",
    backgroundColor: `${colors.primary}22`,
  },
  image: {
    width: 220,
    height: 220,
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: colors.surface,
  },
  videoPlayOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  pollBox: {
    minWidth: 220,
    marginBottom: 4,
  },
  pollQuestion: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
  },
  pollOption: {
    position: "relative",
    overflow: "hidden",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  pollOptionFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    opacity: 0.15,
  },
  pollOptionText: {
    fontSize: 13,
    color: colors.text,
    flexShrink: 1,
  },
  pollOptionTextMine: {
    fontWeight: "700",
  },
  pollOptionPct: {
    fontSize: 12,
    color: colors.textMuted,
  },
  pollOptionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  voterStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  voterStackAvatar: {
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.surface,
    overflow: "hidden",
  },
  voterStackAvatarOverlap: {
    marginLeft: -8,
  },
  voterStackExtra: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.textMuted,
    borderWidth: 1.5,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  voterStackExtraText: {
    fontSize: 8,
    fontWeight: "700",
    color: colors.surface,
  },
  pollMeta: {
    fontSize: 11,
    color: colors.textMuted,
  },
  pollViewVotes: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
  votesBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  votesCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 16,
    padding: 18,
    backgroundColor: colors.surface,
  },
  votesQuestion: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  votesSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: 12,
  },
  votesScroll: {
    maxHeight: 340,
  },
  votesGroup: {
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  votesGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  votesOptionText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    flexShrink: 1,
  },
  votesCount: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  voterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 3,
  },
  voterName: {
    fontSize: 12,
    color: colors.textMuted,
    flexShrink: 1,
  },
  voterEmpty: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  fileIconChip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${colors.primary}1a`,
  },
  fileText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 180,
    paddingVertical: 4,
  },
  voicePlayButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  voicePlayIcon: {
    fontSize: 12,
    color: colors.primaryText,
  },
  voiceTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  voiceTrackFill: {
    height: "100%",
    backgroundColor: colors.primary,
  },
  voiceDuration: {
    fontSize: 11,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  edited: {
    fontSize: 11,
    fontStyle: "italic",
    color: colors.textMuted,
    opacity: 0.7,
  },
  time: {
    fontSize: 11,
    color: colors.textMuted,
    opacity: 0.7,
  },
  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  reactionChip: {
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  reactionText: {
    fontSize: 12,
  },
  systemRow: {
    alignItems: "center",
    marginVertical: 8,
  },
  systemText: {
    fontSize: 12,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  viewerImage: {
    width: "100%",
    height: "100%",
  },
  viewerSaveButton: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  viewerSaveText: {
    color: "#fff",
    fontWeight: "600",
  },
  viewerVideo: {
    width: "100%",
    height: "70%",
  },
  viewerCloseButton: {
    position: "absolute",
    top: 48,
    right: 20,
    zIndex: 1,
  },
  bubbleSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  checkmark: {
    position: "absolute",
    // Centers on the row's full height (avatar+bubble together, whatever
    // that ends up being for this message) instead of a fixed offset from
    // the top, which only lined up for the shortest possible bubble.
    top: "50%",
    marginTop: -11,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  checkmarkOwn: {
    right: 4,
  },
  checkmarkOther: {
    left: 4,
  },
  checkmarkOn: {
    backgroundColor: colors.primary,
  },
  checkmarkOff: {
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  reactionBarFloating: {
    position: "absolute",
    bottom: "100%",
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.background,
    borderRadius: 24,
    padding: 4,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 5,
  },
  reactionBarFloatingOwn: {
    right: 0,
  },
  reactionBarFloatingOther: {
    left: 0,
  },
  reactionBarButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  reactionBarEmoji: {
    fontSize: 17,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  actionButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
    minWidth: 44,
    alignItems: "center",
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
