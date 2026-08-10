import { useEffect } from "react";
import { ActivityIndicator, Button, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useMessages } from "../../hooks/useMessages";
import { useChannelSocket } from "../../hooks/useSocket";
import { useTyping } from "../../hooks/useTyping";
import { markConversationRead } from "../../api/messages";
import { apiErrorMessage } from "../../api/client";
import { useAuthStore } from "../../state/authStore";
import MessageBubble from "../../components/MessageBubble";
import Composer from "../../components/Composer";
import { colors } from "../../theme/colors";
import type { HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "Chat">;

export default function ChatScreen({ route, navigation }: Props) {
  const { containerId, title } = route.params;
  const { data: messages, isLoading, error, refetch, send, react, remove } = useMessages(containerId);
  const { typingName, notifyTyping } = useTyping(containerId);
  const selfId = useAuthStore((s) => s.user?.id);

  useChannelSocket(containerId);

  useEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

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
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            isOwn={item.sender_id === selfId}
            onReact={(emoji) => react.mutate({ messageId: item.id, emoji })}
            onDelete={() => remove.mutate(item.id)}
          />
        )}
        contentContainerStyle={styles.list}
      />
      {typingName ? (
        <Text style={styles.typing}>{typingName} is typing…</Text>
      ) : null}
      <Composer onSend={(payload) => send.mutate(payload)} onTyping={notifyTyping} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  typing: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    fontSize: 12,
    color: colors.textMuted,
  },
});
