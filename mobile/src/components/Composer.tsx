import { useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

import { uploadFile, type PickedFile } from "../api/upload";
import AttachmentPreviewModal, { type PendingAttachment } from "./AttachmentPreviewModal";
import { colors } from "../theme/colors";

export interface SendPayload {
  body: string;
  type?: string;
  mediaUrl?: string;
  mediaName?: string;
  mediaMimeType?: string;
}

export default function Composer({
  onSend,
  onTyping,
}: {
  onSend: (payload: SendPayload) => void;
  onTyping?: () => void;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const lastTyped = useRef(0);

  const submitText = () => {
    const body = text.trim();
    if (!body) return;
    onSend({ body });
    setText("");
  };

  const onChangeText = (value: string) => {
    setText(value);
    // Throttle to one ping every 2s rather than one per keystroke — mirrors
    // web/src/components/Composer.jsx.
    if (Date.now() - lastTyped.current > 2000) {
      lastTyped.current = Date.now();
      onTyping?.();
    }
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
        const isImage = (asset.mimeType || "").startsWith("image/");
        return {
          file: { uri: asset.uri, name: asset.name, mimeType: asset.mimeType || "application/octet-stream" },
          type: isImage ? "image" : "file",
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
    // The server's message.type enum has no 'video' value yet — video
    // capture sends as a generic 'file' attachment (a link, not inline
    // playback) until that's worth a schema change.
    stageFiles([
      {
        file: {
          uri: asset.uri,
          name: asset.fileName || (isVideo ? "video.mp4" : "photo.jpg"),
          mimeType: asset.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
        },
        type: isVideo ? "file" : "image",
      },
    ]);
  };

  return (
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
  );
}

const styles = StyleSheet.create({
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
