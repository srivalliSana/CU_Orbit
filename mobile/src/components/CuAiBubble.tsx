import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { generateAiImage, getAiMessages, sendAiMessage, type AiMessage } from "../api/ai";
import { resolveMediaUrl } from "../constants/config";
import { apiErrorMessage } from "../api/client";
import { useAuthStore } from "../state/authStore";
import { useThemeColors } from "../state/themeStore";

const SUGGESTIONS = ["How do I pin a message?", "How do I schedule a message for later?", "What can you help with?"];

/**
 * The floating "CU AI" bubble + the chat it opens. Self-contained and
 * mounted once at the app root (see App.tsx) rather than as a navigation
 * screen — it needs to float over every tab's stack, not live inside one
 * of them, so it manages its own open/closed state instead of a route.
 */
export default function CuAiBubble() {
  const status = useAuthStore((s) => s.status);
  const colors = useThemeColors();
  const styles = useMemoStyles(colors);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [imageMode, setImageMode] = useState(false);
  const listRef = useRef<FlatList<AiMessage>>(null);
  const queryClient = useQueryClient();

  const { data: messages } = useQuery({
    queryKey: ["aiMessages"],
    queryFn: getAiMessages,
    enabled: open && status === "signedIn",
  });

  const send = useMutation({
    mutationFn: sendAiMessage,
    onMutate: async (sentText: string) => {
      // Optimistic: show the user's own message immediately, the
      // assistant's reply lands once the request resolves — otherwise the
      // composer feels frozen for however long the model takes to answer.
      const optimistic: AiMessage = {
        id: `pending-${Date.now()}`,
        role: "user",
        text: sentText,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<AiMessage[]>(["aiMessages"], (prev) => [...(prev ?? []), optimistic]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    },
    onSuccess: (reply) => {
      queryClient.setQueryData<AiMessage[]>(["aiMessages"], (prev) => [...(prev ?? []), reply]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    },
  });

  const generateImage = useMutation({
    mutationFn: generateAiImage,
    onMutate: async (prompt: string) => {
      const optimistic: AiMessage = {
        id: `pending-${Date.now()}`,
        role: "user",
        text: `🎨 ${prompt}`,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<AiMessage[]>(["aiMessages"], (prev) => [...(prev ?? []), optimistic]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    },
    onSuccess: (reply) => {
      queryClient.setQueryData<AiMessage[]>(["aiMessages"], (prev) => [...(prev ?? []), reply]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    },
  });

  const isBusy = send.isPending || generateImage.isPending;

  useEffect(() => {
    if (open) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
  }, [open]);

  if (status !== "signedIn") return null;

  const submit = (value?: string) => {
    const body = (value ?? text).trim();
    if (!body || isBusy) return;
    setText("");
    Keyboard.dismiss();
    if (imageMode) {
      generateImage.mutate(body);
      setImageMode(false);
    } else {
      send.mutate(body);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        // Sits just above the Home screen's own "+" FAB (bottom:20,
        // height:56 → its top edge is at 76) with a clear gap, instead of
        // overlapping it or the last visible list row.
        style={[styles.bubble, { bottom: insets.bottom + 96 }]}
        accessibilityLabel="Open CU AI"
      >
        <View style={styles.badge}>
          <Text style={styles.badgeText}>AI</Text>
        </View>
        <Text style={styles.bubbleIcon}>✨</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.screen, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarIcon}>✨</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerName}>CU AI</Text>
              <Text style={styles.headerStatus}>Always here to help</Text>
            </View>
          </View>

          <FlatList
            ref={listRef}
            data={messages ?? []}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.emptyRow}>
                <View style={styles.miniAvatar}>
                  <Text style={styles.headerAvatarIcon}>✨</Text>
                </View>
                <View style={[styles.bubbleMsg, styles.bubbleMsgBot]}>
                  <Text style={styles.bubbleMsgText}>
                    Hey! I'm CU AI 👋 Ask me anything — about using Let's Connect, or just to chat.
                  </Text>
                  <View style={styles.suggestRow}>
                    {SUGGESTIONS.map((s) => (
                      <Pressable key={s} style={styles.suggestChip} onPress={() => submit(s)}>
                        <Text style={styles.suggestText}>{s}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            }
            renderItem={({ item }) =>
              item.role === "user" ? (
                <View style={styles.rowUser}>
                  <View style={[styles.bubbleMsg, styles.bubbleMsgUser]}>
                    <Text style={styles.bubbleMsgTextUser}>{item.text}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.rowBot}>
                  <View style={styles.miniAvatar}>
                    <Text style={styles.headerAvatarIcon}>✨</Text>
                  </View>
                  <View style={[styles.bubbleMsg, styles.bubbleMsgBot]}>
                    <Text style={styles.bubbleMsgText}>{item.text}</Text>
                    {item.image_url ? (
                      <Image source={{ uri: resolveMediaUrl(item.image_url) ?? undefined }} style={styles.generatedImage} resizeMode="cover" />
                    ) : null}
                  </View>
                </View>
              )
            }
            ListFooterComponent={
              isBusy ? (
                <View style={styles.rowBot}>
                  <View style={styles.miniAvatar}>
                    <Text style={styles.headerAvatarIcon}>✨</Text>
                  </View>
                  <View style={styles.typingBubble}>
                    <ActivityIndicator size="small" color={colors.textMuted} />
                  </View>
                </View>
              ) : send.isError ? (
                <Text style={styles.errorText}>{apiErrorMessage(send.error, "CU AI couldn't reply — try again.")}</Text>
              ) : generateImage.isError ? (
                <Text style={styles.errorText}>{apiErrorMessage(generateImage.error, "CU AI couldn't generate that image — try again.")}</Text>
              ) : null
            }
          />

          <KeyboardStickyView offset={{ opened: -insets.bottom }}>
            {imageMode ? (
              <View style={styles.imageModeBanner}>
                <Ionicons name="image" size={13} color={colors.primary} />
                <Text style={styles.imageModeBannerText}>Describe an image to generate</Text>
                <Pressable onPress={() => setImageMode(false)} hitSlop={8}>
                  <Ionicons name="close" size={14} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : null}
            <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
              <Pressable
                onPress={() => setImageMode((v) => !v)}
                style={[styles.imageModeButton, imageMode && styles.imageModeButtonActive]}
                accessibilityLabel="Generate an image instead"
              >
                <Ionicons name="image-outline" size={19} color={imageMode ? "#06130D" : colors.textMuted} />
              </Pressable>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={imageMode ? "Describe an image to generate…" : "Ask CU AI anything…"}
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                multiline
              />
              <Pressable onPress={() => submit()} disabled={!text.trim() || isBusy} style={styles.sendButton}>
                <Ionicons name="send" size={17} color="#06130D" />
              </Pressable>
            </View>
          </KeyboardStickyView>
        </View>
      </Modal>
    </>
  );
}

// Avoids re-creating the style object every render without pulling in a
// separate makeStyles indirection just for this one hook call.
function useMemoStyles(colors: ReturnType<typeof useThemeColors>) {
  const ref = useRef<{ colors: typeof colors; styles: ReturnType<typeof buildStyles> } | null>(null);
  if (!ref.current || ref.current.colors !== colors) {
    ref.current = { colors, styles: buildStyles(colors) };
  }
  return ref.current.styles;
}

const buildStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    bubble: {
      position: "absolute",
      right: 16,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.primary,
      shadowOpacity: 0.5,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
      zIndex: 50,
    },
    bubbleIcon: { fontSize: 24 },
    badge: {
      position: "absolute",
      top: -4,
      left: -4,
      backgroundColor: colors.accent,
      borderRadius: 8,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    badgeText: { fontSize: 8, fontWeight: "800", color: "#06130D", letterSpacing: 0.3 },
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    headerAvatarIcon: { fontSize: 15 },
    headerName: { fontSize: 15, fontWeight: "700", color: colors.text },
    headerStatus: { fontSize: 11, color: colors.primary, fontWeight: "600" },
    list: { padding: 14, flexGrow: 1 },
    rowUser: { alignItems: "flex-end", marginVertical: 6 },
    rowBot: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginVertical: 6 },
    miniAvatar: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    bubbleMsg: { maxWidth: "78%", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
    bubbleMsgUser: { backgroundColor: colors.bubbleSelf, borderBottomRightRadius: 4 },
    bubbleMsgBot: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
    bubbleMsgText: { fontSize: 14, color: colors.text, lineHeight: 20 },
    bubbleMsgTextUser: { fontSize: 14, color: "#fff", lineHeight: 20 },
    typingBubble: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderBottomLeftRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    emptyRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
    suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
    suggestChip: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    suggestText: { fontSize: 11.5, color: colors.text },
    errorText: { fontSize: 12, color: colors.danger, textAlign: "center", marginTop: 8 },
    composer: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 14,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    input: {
      flex: 1,
      maxHeight: 100,
      backgroundColor: colors.surface,
      borderRadius: 21,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    generatedImage: {
      width: 220,
      height: 220,
      borderRadius: 12,
      marginTop: 8,
      backgroundColor: colors.background,
    },
    imageModeButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    imageModeButtonActive: {
      backgroundColor: colors.primary,
    },
    imageModeBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingTop: 8,
    },
    imageModeBannerText: {
      flex: 1,
      fontSize: 11,
      fontWeight: "600",
      color: colors.primary,
    },
  });
