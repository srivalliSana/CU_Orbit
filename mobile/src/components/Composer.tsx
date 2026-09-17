import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

import { uploadFile, type PickedFile } from "../api/upload";
import { getChannelMembers, type ChannelMemberRow } from "../api/channels";
import { getSlashCommands, type SlashCommandRow } from "../api/slashCommands";
import AttachmentPreviewModal, { type PendingAttachment } from "./AttachmentPreviewModal";
import Avatar from "./Avatar";
import { useCustomEmojiMap } from "./EmojiPicker";
import { renderMarkdown } from "../lib/markdown";
import { EMOJI_SHORTCODES } from "../lib/emojiShortcodes";
import { useThemeColors } from "../state/themeStore";

export interface SendPayload {
  body: string;
  type?: string;
  mediaUrl?: string;
  mediaName?: string;
  mediaMimeType?: string;
  enrichedMentions?: { user_id: string; display_name: string }[];
  replyToId?: string;
}

export interface ReplyTarget {
  id: string;
  sender_name: string;
  text: string;
}

// Matches an in-progress "@word" run at the end of the typed text — the
// simplification (end-of-string rather than cursor position) holds because
// RN's TextInput doesn't expose live cursor coordinates without extra
// plumbing, and composing a mention mid-message is a rare edit pattern.
const MENTION_TRIGGER = /(?:^|\s)@(\w*)$/;
// Same "end of string" simplification, unclosed ":word".
const EMOJI_TRIGGER = /(?:^|\s):(\w{2,})$/;
// A slash command is only ever the message's first token, so this matches
// the whole value rather than just its tail.
const SLASH_TRIGGER = /^\/(\w*)$/;

type EmojiSuggestion = { id: string; name: string; emoji?: string; url?: string; insert: string };

const formatDuration = (totalSeconds: number) => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export default function Composer({
  onSend,
  onSchedule,
  onTyping,
  channelId,
  kind,
  replyTo,
  onCancelReply,
  onCreatePoll,
}: {
  onSend: (payload: SendPayload) => void;
  onSchedule?: (payload: SendPayload & { sendAt: string }) => void;
  onTyping?: () => void;
  channelId?: string;
  kind?: "channel" | "dm";
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  onCreatePoll?: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [members, setMembers] = useState<ChannelMemberRow[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashCommands, setSlashCommands] = useState<SlashCommandRow[]>([]);
  const [taggedUsers, setTaggedUsers] = useState<{ user_id: string; display_name: string }[]>([]);
  const customEmojiMap = useCustomEmojiMap();
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [formattingOpen, setFormattingOpen] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  // "Send later" — text-only for now (no attachment support on mobile v1).
  // Android's native picker is two sequential dialogs (date, then time);
  // iOS's is one inline spinner with its own Cancel/Schedule buttons.
  const [scheduleStep, setScheduleStep] = useState<"date" | "time" | null>(null);
  const [scheduleDate, setScheduleDate] = useState(() => new Date(Date.now() + 60 * 60000));
  const lastTyped = useRef(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  // Only channels have a fixed member list worth tagging from — a DM is
  // already a conversation with exactly one other person.
  useEffect(() => {
    if (kind !== "channel" || !channelId) {
      setMembers([]);
      return;
    }
    getChannelMembers(channelId).then(setMembers).catch(() => setMembers([]));
  }, [channelId, kind]);

  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [members, mentionQuery]);

  useEffect(() => { getSlashCommands().then(setSlashCommands).catch(() => setSlashCommands([])); }, []);

  const slashSuggestions = useMemo(() => {
    if (slashQuery === null) return [];
    const q = slashQuery.toLowerCase();
    return slashCommands.filter((c) => c.command.toLowerCase().startsWith(q)).slice(0, 6);
  }, [slashCommands, slashQuery]);

  const emojiSuggestions = useMemo<EmojiSuggestion[]>(() => {
    if (emojiQuery === null) return [];
    const q = emojiQuery.toLowerCase();
    const standard: EmojiSuggestion[] = EMOJI_SHORTCODES.filter(([, name]) => name.startsWith(q)).map(([emoji, name]) => ({
      id: `s:${name}`, name, emoji, insert: emoji,
    }));
    const custom: EmojiSuggestion[] = [...customEmojiMap.entries()]
      .filter(([code]) => code.slice(1, -1).toLowerCase().startsWith(q))
      .map(([code, url]) => ({ id: `c:${code}`, name: code.slice(1, -1), url, insert: code }));
    return [...standard, ...custom].slice(0, 8);
  }, [emojiQuery, customEmojiMap]);

  const submitText = () => {
    const body = text.trim();
    if (!body) return;
    // Only keep tags whose "@Name" text is still actually present — guards
    // against a mention surviving in state after the user deleted it from
    // the message.
    const enrichedMentions = taggedUsers.filter((t) => body.includes(`@${t.display_name}`));
    onSend({
      body,
      enrichedMentions: enrichedMentions.length ? enrichedMentions : undefined,
      replyToId: replyTo?.id,
    });
    setText("");
    setTaggedUsers([]);
    setMentionQuery(null);
    setEmojiQuery(null);
    setSlashQuery(null);
    onCancelReply?.();
  };

  const startScheduling = () => {
    if ((!text.trim() && pending.length === 0) || !onSchedule) return;
    setScheduleDate(new Date(Date.now() + 60 * 60000));
    setScheduleStep("date");
  };

  // Handles both flows: attachments staged in the preview modal, or plain
  // typed text — whichever the user actually has pending when the picker
  // resolves, since the two composing paths (type vs. attach) are mutually
  // exclusive in practice (the attachment modal is a blocking sheet).
  const finishScheduling = async (when: Date) => {
    if (pending.length > 0) {
      setUploading(true);
      try {
        for (let i = 0; i < pending.length; i++) {
          const { file, type } = pending[i];
          const { url, name } = await uploadFile(file);
          onSchedule?.({
            body: i === 0 ? caption : "",
            type,
            mediaUrl: url,
            mediaName: name || file.name,
            mediaMimeType: file.mimeType,
            replyToId: i === 0 ? replyTo?.id : undefined,
            sendAt: when.toISOString(),
          });
        }
        setPending([]);
        setCaption("");
        onCancelReply?.();
      } catch (e) {
        Alert.alert("Upload failed", e instanceof Error ? e.message : "Couldn't schedule that attachment.");
      } finally {
        setUploading(false);
      }
      return;
    }
    const body = text.trim();
    const enrichedMentions = taggedUsers.filter((t) => body.includes(`@${t.display_name}`));
    onSchedule?.({
      body,
      enrichedMentions: enrichedMentions.length ? enrichedMentions : undefined,
      replyToId: replyTo?.id,
      sendAt: when.toISOString(),
    });
    setText("");
    setTaggedUsers([]);
    setMentionQuery(null);
    setEmojiQuery(null);
    setSlashQuery(null);
    onCancelReply?.();
  };

  const onPickerChange = (event: { type: string }, picked?: Date) => {
    if (Platform.OS === "android") {
      setScheduleStep(null);
      if (event.type === "dismissed" || !picked) return;
      if (scheduleStep === "date") {
        setScheduleDate(picked);
        setScheduleStep("time");
      } else {
        finishScheduling(picked);
      }
    } else if (picked) {
      setScheduleDate(picked);
    }
  };

  const onChangeText = (value: string) => {
    setText(value);
    const mentionMatch = value.match(MENTION_TRIGGER);
    setMentionQuery(mentionMatch ? mentionMatch[1] : null);
    const emojiMatch = value.match(EMOJI_TRIGGER);
    setEmojiQuery(emojiMatch ? emojiMatch[1] : null);
    const slashMatch = value.match(SLASH_TRIGGER);
    setSlashQuery(slashMatch ? slashMatch[1] : null);
    // Throttle to one ping every 2s rather than one per keystroke — mirrors
    // web/src/components/Composer.jsx.
    if (Date.now() - lastTyped.current > 2000) {
      lastTyped.current = Date.now();
      onTyping?.();
    }
  };

  // Wraps the current selection (or, with nothing selected, inserts the pair
  // at the cursor) with a marker on each side — mirrors web/src/components/
  // Composer.jsx's wrapSelection. Doesn't try to restore the exact cursor
  // position afterward (RN's controlled `selection` prop fights typing if
  // driven every keystroke), so the cursor lands wherever the native input
  // defaults to after a value change — a minor UX gap versus web, not a bug.
  const wrapSelection = (before: string, after: string = before) => {
    const { start, end } = selection;
    const selected = text.slice(start, end);
    setText(text.slice(0, start) + before + selected + after + text.slice(end));
  };

  // Applies mapper() to every line touching the current selection — mirrors
  // web's mapLines, the primitive behind the list/indent buttons.
  const mapLines = (mapper: (line: string) => string) => {
    const { start, end } = selection;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = text.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = text.length;
    const block = text.slice(lineStart, lineEnd);
    const nextBlock = block.split("\n").map(mapper).join("\n");
    setText(text.slice(0, lineStart) + nextBlock + text.slice(lineEnd));
  };

  const toggleBulletList = () => mapLines((line) => (line.startsWith("- ") ? line.slice(2) : `- ${line}`));
  const toggleNumberedList = () => {
    let n = 1;
    mapLines((line) => (/^\d+\.\s/.test(line) ? line.replace(/^\d+\.\s/, "") : `${n++}. ${line}`));
  };
  const decreaseIndent = () => mapLines((line) => line.replace(/^(\s{1,2}|- |\d+\.\s)/, ""));

  const pickMention = (member: ChannelMemberRow) => {
    const replaced = text.replace(MENTION_TRIGGER, (m) => `${m.startsWith(" ") ? " " : ""}@${member.name} `);
    setText(replaced);
    setTaggedUsers((prev) => [...prev, { user_id: member.id, display_name: member.name }]);
    setMentionQuery(null);
  };

  const pickEmoji = (item: EmojiSuggestion) => {
    const replaced = text.replace(EMOJI_TRIGGER, (m) => `${m.startsWith(" ") ? " " : ""}${item.insert} `);
    setText(replaced);
    setEmojiQuery(null);
  };

  const pickSlashCommand = (cmd: SlashCommandRow) => {
    setText(`/${cmd.command} `);
    setSlashQuery(null);
  };

  // Picking (camera or document) only stages files for review — nothing
  // uploads until the preview sheet's Send is pressed. Any text already
  // typed in the composer seeds the caption so it isn't lost.
  const stageFiles = (files: PendingAttachment[]) => {
    setPending(files);
    setCaption(text.trim());
  };

  const cancelPending = () => {
    setPending([]);
    setCaption("");
  };

  // Any caption applies to the first attachment only — one message carries
  // one attachment (Message.attachments is a single entry per row), so
  // repeating the same caption on every file in a multi-select would read
  // worse than putting it once, on the first.
  const confirmPending = async () => {
    setUploading(true);
    try {
      for (let i = 0; i < pending.length; i++) {
        const { file, type } = pending[i];
        const { url, name } = await uploadFile(file);
        onSend({
          body: i === 0 ? caption : "",
          type,
          mediaUrl: url,
          mediaName: name || file.name,
          mediaMimeType: file.mimeType,
          replyToId: i === 0 ? replyTo?.id : undefined,
        });
      }
      setText("");
      setPending([]);
      setCaption("");
      onCancelReply?.();
    } catch (e) {
      Alert.alert(
        "Upload failed",
        e instanceof Error ? e.message : "Couldn't send that attachment. Please try again."
      );
    } finally {
      setUploading(false);
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled || !result.assets?.length) return;
    stageFiles(
      result.assets.map((asset) => {
        const mime = asset.mimeType || "";
        const type = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : "file";
        return {
          file: { uri: asset.uri, name: asset.name, mimeType: mime || "application/octet-stream" },
          type,
        };
      })
    );
  };

  // Android has no combined photo/video capture intent — ACTION_IMAGE_CAPTURE
  // and ACTION_VIDEO_CAPTURE are separate native intents, so requesting both
  // mediaTypes in one launchCameraAsync call silently only shows photo mode
  // (reported as "camera only shows photo, not video"). Two explicit modes
  // instead of guessing at a toggle that doesn't exist on this platform.
  const captureFromCamera = async (mode: "image" | "video") => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera access needed", "Enable camera access in settings to capture photos or video.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: mode === "video" ? ["videos"] : ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const isVideo = asset.type === "video";
    stageFiles([
      {
        file: {
          uri: asset.uri,
          name: asset.fileName || (isVideo ? "video.mp4" : "photo.jpg"),
          mimeType: asset.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
        },
        type: isVideo ? "video" : "image",
      },
    ]);
  };

  // Existing photos/videos from the gallery — distinct from the camera
  // options above, which only ever capture something new.
  const pickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo access needed", "Enable photo access in settings to share photos or videos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    stageFiles(
      result.assets.map((asset) => {
        const isVideo = asset.type === "video";
        return {
          file: {
            uri: asset.uri,
            name: asset.fileName || (isVideo ? "video.mp4" : "photo.jpg"),
            mimeType: asset.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
          },
          type: isVideo ? "video" : "image",
        };
      })
    );
  };

  const startVoiceRecording = async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Microphone access needed", "Enable microphone access in settings to record voice messages.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const stopVoiceRecording = async (keep: boolean) => {
    const seconds = Math.round(recorderState.durationMillis / 1000);
    await recorder.stop();
    if (!keep || !recorder.uri) return;
    stageFiles([
      {
        file: { uri: recorder.uri, name: `Voice message (${formatDuration(seconds)}).m4a`, mimeType: "audio/m4a" },
        type: "voice",
      },
    ]);
  };

  return (
    <View>
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          <FlatList
            data={suggestions}
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable onPress={() => pickMention(item)} style={styles.suggestionRow}>
                <Avatar name={item.name} url={item.avatarUrl} size={28} />
                <Text style={styles.suggestionText}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      )}
      {slashSuggestions.length > 0 && (
        <View style={styles.suggestions}>
          <FlatList
            data={slashSuggestions}
            keyExtractor={(c) => c.command}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable onPress={() => pickSlashCommand(item)} style={styles.suggestionRow}>
                <Text style={styles.slashCommandText}>/{item.command}</Text>
                <Text style={styles.suggestionText} numberOfLines={1}>{item.usage_hint || item.description}</Text>
              </Pressable>
            )}
          />
        </View>
      )}
      {emojiSuggestions.length > 0 && (
        <View style={styles.suggestions}>
          <FlatList
            data={emojiSuggestions}
            keyExtractor={(e) => e.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable onPress={() => pickEmoji(item)} style={styles.suggestionRow}>
                {item.url ? (
                  <Image source={{ uri: item.url }} style={{ width: 22, height: 22 }} />
                ) : (
                  <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
                )}
                <Text style={styles.suggestionText}>:{item.name}:</Text>
              </Pressable>
            )}
          />
        </View>
      )}
      {replyTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyTextWrap}>
            <Text style={styles.replySender}>Replying to {replyTo.sender_name}</Text>
            <Text style={styles.replyPreview} numberOfLines={1}>
              {replyTo.text ? renderMarkdown(replyTo.text, styles.replyPreview) : "Attachment"}
            </Text>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={8}>
            <Text style={styles.replyCancel}>✕</Text>
          </Pressable>
        </View>
      )}
      {formattingOpen && (
        <View style={styles.formattingBar}>
          <Pressable onPress={() => wrapSelection("**")} style={styles.formatButton}>
            <Text style={[styles.formatButtonText, { fontWeight: "700" }]}>B</Text>
          </Pressable>
          <Pressable onPress={() => wrapSelection("_")} style={styles.formatButton}>
            <Text style={[styles.formatButtonText, { fontStyle: "italic" }]}>I</Text>
          </Pressable>
          <Pressable onPress={() => wrapSelection("<u>", "</u>")} style={styles.formatButton}>
            <Text style={[styles.formatButtonText, { textDecorationLine: "underline" }]}>U</Text>
          </Pressable>
          <Pressable onPress={() => wrapSelection("~~")} style={styles.formatButton}>
            <Text style={[styles.formatButtonText, { textDecorationLine: "line-through" }]}>S</Text>
          </Pressable>
          <View style={styles.formatDivider} />
          <Pressable onPress={toggleNumberedList} style={styles.formatButton}>
            <Text style={styles.formatButtonText}>1.</Text>
          </Pressable>
          <Pressable onPress={toggleBulletList} style={styles.formatButton}>
            <Text style={styles.formatButtonText}>•</Text>
          </Pressable>
          <Pressable onPress={decreaseIndent} style={styles.formatButton}>
            <Text style={styles.formatButtonText}>⇤</Text>
          </Pressable>
          <View style={styles.formatDivider} />
          <Pressable onPress={() => wrapSelection("`")} style={styles.formatButton}>
            <Text style={[styles.formatButtonText, { fontFamily: "monospace" }]}>{"</>"}</Text>
          </Pressable>
          <Pressable onPress={() => wrapSelection("```\n", "\n```")} style={styles.formatButton}>
            <Text style={[styles.formatButtonText, { fontFamily: "monospace" }]}>{"{ }"}</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.container}>
        <View>
          <Pressable onPress={() => setAttachMenuOpen((v) => !v)} style={styles.iconButton}>
            <Text style={styles.icon}>📎</Text>
          </Pressable>
          {attachMenuOpen ? (
            <>
              <Pressable style={styles.menuBackdrop} onPress={() => setAttachMenuOpen(false)} />
              <View style={styles.attachMenu}>
                <Pressable
                  style={styles.attachMenuRow}
                  onPress={() => { setAttachMenuOpen(false); pickDocument(); }}
                >
                  <Text style={styles.attachMenuIcon}>📄</Text>
                  <Text style={styles.attachMenuText}>Document</Text>
                </Pressable>
                <Pressable
                  style={styles.attachMenuRow}
                  onPress={() => { setAttachMenuOpen(false); pickFromGallery(); }}
                >
                  <Text style={styles.attachMenuIcon}>🖼️</Text>
                  <Text style={styles.attachMenuText}>Gallery</Text>
                </Pressable>
                <Pressable
                  style={styles.attachMenuRow}
                  onPress={() => { setAttachMenuOpen(false); captureFromCamera("image"); }}
                >
                  <Text style={styles.attachMenuIcon}>📷</Text>
                  <Text style={styles.attachMenuText}>Camera</Text>
                </Pressable>
                <Pressable
                  style={styles.attachMenuRow}
                  onPress={() => { setAttachMenuOpen(false); captureFromCamera("video"); }}
                >
                  <Text style={styles.attachMenuIcon}>🎥</Text>
                  <Text style={styles.attachMenuText}>Video</Text>
                </Pressable>
                {kind === "channel" && onCreatePoll ? (
                  <Pressable
                    style={styles.attachMenuRow}
                    onPress={() => { setAttachMenuOpen(false); onCreatePoll(); }}
                  >
                    <Text style={styles.attachMenuIcon}>📊</Text>
                    <Text style={styles.attachMenuText}>Poll</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}
        </View>

        <Pressable
          onPress={() => setFormattingOpen((v) => !v)}
          style={[styles.iconButton, formattingOpen && styles.iconButtonActive]}
        >
          <Text style={[styles.formatToggleText, formattingOpen && { color: colors.primary }]}>Aa</Text>
        </Pressable>

        <TextInput
          value={text}
          onChangeText={onChangeText}
          onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
          placeholder="Type a message"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          multiline
          textAlignVertical="top"
        />

        {recorderState.isRecording ? (
          <View style={styles.recordingRow}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTimer}>{formatDuration(Math.round(recorderState.durationMillis / 1000))}</Text>
            <Pressable onPress={() => stopVoiceRecording(false)} hitSlop={8} style={styles.recordingCancel}>
              <Text style={styles.recordingCancelText}>✕</Text>
            </Pressable>
            <Pressable onPress={() => stopVoiceRecording(true)} style={styles.recordingStop}>
              <View style={styles.recordingStopIcon} />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={startVoiceRecording} style={styles.iconButton}>
            <Text style={styles.icon}>🎙️</Text>
          </Pressable>
        )}

        <Pressable
          onPress={submitText}
          onLongPress={startScheduling}
          disabled={!text.trim()}
          style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>

        {scheduleStep && Platform.OS === "android" && (
          <DateTimePicker
            value={scheduleDate}
            mode={scheduleStep}
            minimumDate={new Date()}
            onChange={onPickerChange}
          />
        )}

        {scheduleStep && Platform.OS === "ios" && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setScheduleStep(null)}>
            <Pressable style={styles.scheduleBackdrop} onPress={() => setScheduleStep(null)}>
              <Pressable style={styles.scheduleSheet} onPress={(e) => e.stopPropagation()}>
                <Text style={styles.scheduleTitle}>Send later</Text>
                <DateTimePicker
                  value={scheduleDate}
                  mode="datetime"
                  display="spinner"
                  minimumDate={new Date()}
                  onChange={onPickerChange}
                />
                <View style={styles.scheduleActions}>
                  <Pressable onPress={() => setScheduleStep(null)} style={styles.scheduleCancel}>
                    <Text style={styles.scheduleCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={() => { finishScheduling(scheduleDate); setScheduleStep(null); }} style={styles.scheduleConfirm}>
                    <Text style={styles.scheduleConfirmText}>Schedule</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        )}

        <AttachmentPreviewModal
          visible={pending.length > 0}
          attachments={pending}
          caption={caption}
          onChangeCaption={setCaption}
          uploading={uploading}
          onCancel={cancelPending}
          onConfirm={confirmPending}
          onLongPressConfirm={onSchedule ? startScheduling : undefined}
        />
      </View>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    backgroundColor: colors.surface,
  },
  replyTextWrap: {
    flex: 1,
  },
  replySender: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  replyPreview: {
    fontSize: 12,
    color: colors.textMuted,
  },
  replyCancel: {
    fontSize: 16,
    color: colors.textMuted,
    paddingHorizontal: 4,
  },
  suggestions: {
    maxHeight: 200,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  suggestionText: {
    fontSize: 14,
    color: colors.text,
    flexShrink: 1,
  },
  slashCommandText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  iconButton: {
    padding: 8,
  },
  iconButtonActive: {
    backgroundColor: `${colors.primary}1a`,
    borderRadius: 14,
  },
  icon: {
    fontSize: 20,
  },
  formatToggleText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textMuted,
    paddingHorizontal: 2,
  },
  formattingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  formatButton: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  formatButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  formatDivider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    backgroundColor: colors.border,
    marginHorizontal: 2,
  },
  recordingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: `${colors.danger}1a`,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  recordingTimer: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.danger,
    fontVariant: ["tabular-nums"],
  },
  recordingCancel: {
    paddingHorizontal: 4,
  },
  recordingCancelText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  recordingStop: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
  },
  recordingStopIcon: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: "#fff",
  },
  menuBackdrop: {
    position: "absolute",
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    zIndex: 10,
  },
  attachMenu: {
    position: "absolute",
    bottom: "100%",
    left: 0,
    marginBottom: 8,
    minWidth: 180,
    borderRadius: 16,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    zIndex: 20,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  attachMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  attachMenuIcon: {
    fontSize: 16,
    width: 20,
    textAlign: "center",
  },
  attachMenuText: {
    fontSize: 14,
    color: colors.text,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 64,
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendText: {
    color: colors.primaryText,
    fontWeight: "600",
  },
  scheduleBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  scheduleSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  scheduleTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  scheduleActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    width: "100%",
  },
  scheduleCancel: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  scheduleCancelText: {
    color: colors.textMuted,
    fontWeight: "600",
  },
  scheduleConfirm: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  scheduleConfirmText: {
    color: colors.primaryText,
    fontWeight: "700",
  },
});
