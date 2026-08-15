import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

import { uploadFile, type PickedFile } from "../api/upload";
import { getChannelMembers, type ChannelMemberRow } from "../api/channels";
import AttachmentPreviewModal, { type PendingAttachment } from "./AttachmentPreviewModal";
import Avatar from "./Avatar";
import { useThemeColors } from "../state/themeStore";

export interface SendPayload {
  body: string;
  type?: string;
  mediaUrl?: string;
  mediaName?: string;
  mediaMimeType?: string;
  enrichedMentions?: { user_id: string; display_name: string }[];
}

// Matches an in-progress "@word" run at the end of the typed text — the
// simplification (end-of-string rather than cursor position) holds because
// RN's TextInput doesn't expose live cursor coordinates without extra
// plumbing, and composing a mention mid-message is a rare edit pattern.
const MENTION_TRIGGER = /(?:^|\s)@(\w*)$/;

export default function Composer({
  onSend,
  onTyping,
  channelId,
  kind,
}: {
  onSend: (payload: SendPayload) => void;
  onTyping?: () => void;
  channelId?: string;
  kind?: "channel" | "dm";
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [members, setMembers] = useState<ChannelMemberRow[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [taggedUsers, setTaggedUsers] = useState<{ user_id: string; display_name: string }[]>([]);
  const lastTyped = useRef(0);

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

  const submitText = () => {
    const body = text.trim();
    if (!body) return;
    // Only keep tags whose "@Name" text is still actually present — guards
    // against a mention surviving in state after the user deleted it from
    // the message.
    const enrichedMentions = taggedUsers.filter((t) => body.includes(`@${t.display_name}`));
    onSend({ body, enrichedMentions: enrichedMentions.length ? enrichedMentions : undefined });
    setText("");
    setTaggedUsers([]);
    setMentionQuery(null);
  };

  const onChangeText = (value: string) => {
    setText(value);
    const match = value.match(MENTION_TRIGGER);
    setMentionQuery(match ? match[1] : null);
    // Throttle to one ping every 2s rather than one per keystroke — mirrors
    // web/src/components/Composer.jsx.
    if (Date.now() - lastTyped.current > 2000) {
      lastTyped.current = Date.now();
      onTyping?.();
    }
  };

  const pickMention = (member: ChannelMemberRow) => {
    const replaced = text.replace(MENTION_TRIGGER, (m) => `${m.startsWith(" ") ? " " : ""}@${member.name} `);
    setText(replaced);
    setTaggedUsers((prev) => [...prev, { user_id: member.id, display_name: member.name }]);
    setMentionQuery(null);
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
        });
      }
      setText("");
      setPending([]);
      setCaption("");
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

  // One camera call, both capture modes allowed — the device's own camera
  // app supplies its native photo/video toggle (every stock Android camera
  // has one), so there's no need for an app-level "which one?" prompt in
  // front of it. allowsEditing is left off here specifically because it's
  // undefined behavior when a video is captured through a dual-mode
  // request — see captureFromCamera.
  const openCamera = () => captureFromCamera();

  const captureFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera access needed", "Enable camera access in settings to capture photos or video.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images", "videos"],
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
      <View style={styles.container}>
        <Pressable onPress={pickDocument} style={styles.iconButton}>
          <Text style={styles.icon}>📎</Text>
        </Pressable>
        <Pressable onPress={openCamera} style={styles.iconButton}>
          <Text style={styles.icon}>📷</Text>
        </Pressable>

        <TextInput
          value={text}
          onChangeText={onChangeText}
          placeholder="Type a message"
          style={styles.input}
          multiline
        />

        <Pressable
          onPress={submitText}
          disabled={!text.trim()}
          style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>

        <AttachmentPreviewModal
          visible={pending.length > 0}
          attachments={pending}
          caption={caption}
          onChangeCaption={setCaption}
          uploading={uploading}
          onCancel={cancelPending}
          onConfirm={confirmPending}
        />
      </View>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
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
  icon: {
    fontSize: 20,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
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
});
