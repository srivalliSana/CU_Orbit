import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

import { uploadFile, type PickedFile } from "../api/upload";
import { colors } from "../theme/colors";

export interface SendPayload {
  body: string;
  type?: string;
  mediaUrl?: string;
}

export default function Composer({
  onSend,
  onTyping,
}: {
  onSend: (payload: SendPayload) => void;
  onTyping?: () => void;
}) {
  const [text, setText] = useState("");
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

  const sendPicked = async (file: PickedFile, type: string) => {
    setUploading(true);
    try {
      const { url } = await uploadFile(file);
      onSend({ body: "", type, mediaUrl: url });
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
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const isImage = (asset.mimeType || "").startsWith("image/");
    await sendPicked(
      { uri: asset.uri, name: asset.name, mimeType: asset.mimeType || "application/octet-stream" },
      isImage ? "image" : "file"
    );
  };

  const openCamera = () => {
    Alert.alert("Camera", "What would you like to capture?", [
      { text: "Photo", onPress: () => captureFromCamera("images") },
      { text: "Video", onPress: () => captureFromCamera("videos") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const captureFromCamera = async (mediaTypes: "images" | "videos") => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera access needed", "Enable camera access in settings to capture photos or video.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes, quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    // The server's message.type enum has no 'video' value yet — video
    // capture sends as a generic 'file' attachment (a link, not inline
    // playback) until that's worth a schema change.
    const isVideo = mediaTypes === "videos";
    await sendPicked(
      {
        uri: asset.uri,
        name: asset.fileName || (isVideo ? "video.mp4" : "photo.jpg"),
        mimeType: asset.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
      },
      isVideo ? "file" : "image"
    );
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={pickDocument} disabled={uploading} style={styles.iconButton}>
        <Text style={styles.icon}>📎</Text>
      </Pressable>
      <Pressable onPress={openCamera} disabled={uploading} style={styles.iconButton}>
        <Text style={styles.icon}>📷</Text>
      </Pressable>

      <TextInput
        value={text}
        onChangeText={onChangeText}
        placeholder="Type a message"
        style={styles.input}
        multiline
      />

      {uploading ? (
        <ActivityIndicator style={styles.sendButton} color={colors.primary} />
      ) : (
        <Pressable
          onPress={submitText}
          disabled={!text.trim()}
          style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      )}
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
