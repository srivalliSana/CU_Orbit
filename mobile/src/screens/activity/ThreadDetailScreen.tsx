import { useEffect, useMemo } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { getThread, markThreadRead } from "../../api/threads";
import { reactToMessage, sendMessage, sendMessageAction, deleteMessage, hideMessage, editMessage, setMessagePinned, starMessage, unstarMessage } from "../../api/messages";
import MessageBubble from "../../components/MessageBubble";
import Composer, { type SendPayload } from "../../components/Composer";
import { useAuthStore } from "../../state/authStore";
import { useThemeColors } from "../../state/themeStore";
import type { HomeStackParamList } from "../../navigation/types";
import type { Message } from "../../types/api";

type Props = NativeStackScreenProps<HomeStackParamList, "ThreadDetail">;

export default function ThreadDetailScreen({ route }: Props) {
  const { parentId } = route.params;
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const selfId = useAuthStore((s) => s.user?.id);
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "admin");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["thread", parentId], queryFn: () => getThread(parentId) });

  useEffect(() => {
    markThreadRead(parentId).finally(() => queryClient.invalidateQueries({ queryKey: ["threads"] }));
  }, [parentId, queryClient]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["thread", parentId] });
    queryClient.invalidateQueries({ queryKey: ["threads"] });
  };

  const react = useMutation({ mutationFn: (vars: { id: string; emoji: string }) => reactToMessage(vars.id, vars.emoji), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: deleteMessage, onSuccess: invalidate });
  const hide = useMutation({ mutationFn: hideMessage, onSuccess: invalidate });
  const edit = useMutation({ mutationFn: (vars: { id: string; body: string }) => editMessage(vars.id, vars.body), onSuccess: invalidate });
  const pin = useMutation({ mutationFn: (vars: { id: string; pinned: boolean }) => setMessagePinned(vars.id, vars.pinned), onSuccess: invalidate });
  const star = useMutation({
    mutationFn: (vars: { id: string; starred: boolean }) => (vars.starred ? starMessage(vars.id) : unstarMessage(vars.id)),
    onSuccess: invalidate,
  });
  const action = useMutation({
    mutationFn: (vars: { id: string; actionId: string; value?: string }) => sendMessageAction(vars.id, vars.actionId, vars.value),
    onSuccess: invalidate,
  });
  const send = useMutation({
    mutationFn: (payload: SendPayload) =>
      sendMessage({
        containerId: (data?.root.channel_id ?? data?.root.dm_id)!,
        body: payload.body,
        type: payload.type,
        mediaUrl: payload.mediaUrl,
        mediaName: payload.mediaName,
        mediaMimeType: payload.mediaMimeType,
        enrichedMentions: payload.enrichedMentions,
        replyToId: parentId,
      }),
    onSuccess: invalidate,
  });

  if (isLoading || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const { root, replies } = data;
  const isChannel = !!root.channel_id;
  const rowActions = (message: Message) => ({
    isOwn: message.sender_id === selfId,
    canModerate: isSuperAdmin,
    isSuperAdmin,
    currentUserId: selfId,
    onReact: (emoji: string) => react.mutate({ id: message.id, emoji }),
    onDeleteForMe: () => hide.mutate(message.id),
    onDeleteForEveryone: () => remove.mutate(message.id),
    onEdit: (body: string) => edit.mutate({ id: message.id, body }),
    onPin: (pinned: boolean) => pin.mutate({ id: message.id, pinned }),
    onStar: (starred: boolean) => star.mutate({ id: message.id, starred }),
    onAction: (actionId: string, value: string | undefined) => action.mutate({ id: message.id, actionId, value }),
  });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        data={replies}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <MessageBubble message={root} {...rowActions(root)} />
            <View style={styles.divider}>
              <Text style={styles.dividerText}>
                {replies.length} {replies.length === 1 ? "reply" : "replies"}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => <MessageBubble message={item} {...rowActions(item)} />}
      />
      <Composer
        onSend={(payload) => send.mutate(payload)}
        channelId={isChannel ? root.channel_id ?? undefined : undefined}
        kind={isChannel ? "channel" : "dm"}
      />
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    paddingVertical: 8,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
});
