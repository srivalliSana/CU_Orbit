import { useMemo, useState } from "react";
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import ReactionPicker from "./ReactionPicker";
import EditMessageModal from "./EditMessageModal";
import Avatar from "./Avatar";
import { renderMessageText } from "../lib/markdown";
import { resolveMediaUrl } from "../constants/config";
import { clockLabel } from "../lib/format";
import { useThemeColors } from "../state/themeStore";
import type { Message } from "../types/api";

const FLAG_GRANT_READ_URI_PERMISSION = 1;

export default function MessageBubble({
  message,
  isOwn,
  canModerate,
  isSuperAdmin,
  onReact,
  onDeleteForMe,
  onDeleteForEveryone,
  onEdit,
  onPin,
  onReply,
  onForward,
  onStar,
  onOpenProfile,
  onVote,
  highlighted,
  currentUserId,
  onOpenDm,
}: {
  message: Message;
  isOwn: boolean;
  canModerate?: boolean;
  isSuperAdmin?: boolean;
  highlighted?: boolean;
  onReact: (emoji: string) => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  onEdit: (text: string) => void;
  onPin: (pinned: boolean) => void;
  onReply?: () => void;
  onForward?: () => void;
  onStar?: (starred: boolean) => void;
  onOpenProfile?: (userId: string) => void;
  onVote?: (optionIndex: number) => void;
  currentUserId?: string;
  onOpenDm?: (chat: { id: string; kind: "dm"; title: string }) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [votesVisible, setVotesVisible] = useState(false);

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
  // filename, shown/saved instead of "1755000000000-report.pdf".
  const fileName = message.attachments?.[0]?.name || attachmentUrl?.split("/").pop() || "file";
  const mimeType = message.attachments?.[0]?.mimeType;
  // "SUPERADMIN: edit any message" / "ADMIN: cannot edit others' messages" —
  // edit override is admin-only, unlike delete which channel admins share.
  const canEdit = (isOwn || !!isSuperAdmin) && message.type === "text";
  const canDelete = isOwn || !!canModerate;

  const confirmDelete = () => {
    const buttons: Parameters<typeof Alert.alert>[2] = [
      { text: "Delete for me", onPress: onDeleteForMe },
    ];
    if (canDelete) buttons.push({ text: "Delete for everyone", style: "destructive", onPress: onDeleteForEveryone });
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Delete this message?", undefined, buttons);
  };

  const downloadToCache = async () => {
    if (!attachmentUrl) throw new Error("No attachment URL");
    const destination = new File(Paths.cache, fileName);
    return File.downloadFileAsync(attachmentUrl, destination, { idempotent: true });
  };

  // Real "open with the app registered for this file type, or ask which
  // app" behaviour (ACTION_VIEW) — not the share sheet, which is a
  // different Android intent (ACTION_SEND, for sending content to another
  // app) that was being used here before and confused the two.
  // getContentUriAsync wraps the download in the FileProvider content:// URI
  // ACTION_VIEW requires; Expo's build already registers that provider, no
  // manual native config needed.
  const handleOpen = async () => {
    if (Platform.OS !== "android") {
      // iOS has no equivalent chooser API in Expo; fall back to sharing.
      try {
        const file = await downloadToCache();
        await Sharing.shareAsync(file.uri, { dialogTitle: `Open ${fileName}` });
      } catch (e) {
        Alert.alert("Couldn't open file", e instanceof Error ? e.message : "Please try again.");
      }
      return;
    }
    try {
      const file = await downloadToCache();
      const contentUri = await FileSystemLegacy.getContentUriAsync(file.uri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        type: mimeType,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      });
    } catch (e) {
      Alert.alert("Couldn't open file", e instanceof Error ? e.message : "Please try again.");
    }
  };

  // Saving to a user-chosen location has no dedicated API in this Expo SDK
  // without a new native dependency — the share sheet is the practical
  // stand-in; most Android share sheets include a "Save to device"/Files
  // target among the apps offered.
  const handleSave = async () => {
    try {
      const file = await downloadToCache();
      await Sharing.shareAsync(file.uri, { dialogTitle: `Save ${fileName}` });
    } catch (e) {
      Alert.alert("Couldn't save file", e instanceof Error ? e.message : "Please try again.");
    }
  };

  const onFileLongPress = () => {
    Alert.alert(fileName, undefined, [
      { text: "Open", onPress: handleOpen },
      { text: "Save to device", onPress: handleSave },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
      {message.is_pinned ? <Text style={styles.pinnedLabel}>📌 Pinned</Text> : null}
      <Pressable
        onLongPress={() => setPickerVisible(true)}
        style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther, highlighted && styles.bubbleHighlighted]}
      >
        {!isOwn ? (
          <Pressable onPress={() => onOpenProfile?.(message.sender_id)} hitSlop={4}>
            <Text style={styles.senderName}>{message.sender_name}</Text>
          </Pressable>
        ) : null}

        {message.forwarded_from ? (
          <Text style={styles.forwardedLabel}>➡️ Forwarded from {message.forwarded_from.sender_name}</Text>
        ) : null}

        {message.reply_to ? (
          <View style={styles.replyQuote}>
            <Text style={styles.replyQuoteSender}>{message.reply_to.sender_name}</Text>
            <Text style={styles.replyQuoteText} numberOfLines={1}>{message.reply_to.text || "Attachment"}</Text>
          </View>
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
          <Pressable onPress={() => setImageViewerVisible(true)}>
            <Image source={{ uri: attachmentUrl }} style={styles.image} resizeMode="cover" />
          </Pressable>
        ) : message.type === "video" && attachmentUrl ? (
          <Pressable onLongPress={handleSave}>
            <VideoBubble uri={attachmentUrl} style={styles.image} />
          </Pressable>
        ) : message.type === "voice" && attachmentUrl ? (
          <VoiceBubble uri={attachmentUrl} styles={styles} />
        ) : message.type === "file" && attachmentUrl ? (
          <Pressable onPress={handleOpen} onLongPress={onFileLongPress} style={styles.fileRow}>
            <Text style={styles.fileIcon}>📎</Text>
            <Text style={styles.fileText} numberOfLines={1}>
              {fileName}
            </Text>
          </Pressable>
        ) : null}

        {message.text && message.type !== "poll" ? (
          <Text style={styles.text}>
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
        <View style={styles.metaRow}>
          {message.edited_at ? <Text style={styles.edited}>edited</Text> : null}
          <Text style={styles.time}>{clockLabel(message.sent_at)}</Text>
        </View>

        {reactionCounts.length > 0 ? (
          <View style={styles.reactionsRow}>
            {reactionCounts.map(([emoji, count]) => (
              <Pressable key={emoji} style={styles.reactionChip} onPress={() => onReact(emoji)}>
                <Text style={styles.reactionText}>
                  {emoji} {count > 1 ? count : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Pressable>

      <ReactionPicker
        visible={pickerVisible}
        canEdit={canEdit}
        canDelete={canDelete}
        isPinned={!!message.is_pinned}
        isStarred={!!message.is_starred}
        onSelect={onReact}
        onEdit={() => setEditVisible(true)}
        onDelete={confirmDelete}
        onPin={() => onPin(!message.is_pinned)}
        onReply={onReply}
        onForward={onForward}
        onStar={() => onStar?.(!message.is_starred)}
        onClose={() => setPickerVisible(false)}
      />

      <EditMessageModal
        visible={editVisible}
        initialText={message.text}
        onSave={onEdit}
        onClose={() => setEditVisible(false)}
      />

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
    </View>
  );
}

// A separate component (not inlined in MessageBubble) so useVideoPlayer —
// which must run unconditionally, same order every render — only mounts for
// rows that are actually a video, instead of needing a guard inside a hook.
function VideoBubble({ uri, style }: { uri: string; style: object }) {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      player={player}
      style={style}
      nativeControls
      // The native controls already include a fullscreen toggle; this just
      // confirms the platform is allowed to honour it.
      fullscreenOptions={{ enable: true }}
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

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  row: {
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  rowOwn: {
    alignItems: "flex-end",
  },
  rowOther: {
    alignItems: "flex-start",
  },
  pinnedLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 2,
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleOwn: {
    backgroundColor: colors.bubbleSelf,
  },
  bubbleOther: {
    backgroundColor: colors.bubbleOther,
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
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: colors.surface,
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
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  fileIcon: {
    fontSize: 18,
  },
  fileText: {
    fontSize: 14,
    color: colors.primary,
    maxWidth: 180,
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
    fontSize: 10,
    fontStyle: "italic",
    color: colors.textMuted,
  },
  time: {
    fontSize: 10,
    color: colors.textMuted,
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
});
