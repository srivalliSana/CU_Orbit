import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useIsFocused } from "@react-navigation/native";

import {
  deleteMessage,
  editMessage,
  getMessages,
  reactToMessage,
  sendMessage,
  setMessagePinned,
  starMessage,
  unstarMessage,
  votePoll,
} from "../api/messages";

export function useMessages(containerId: string) {
  const isFocused = useIsFocused();

  const query = useQuery({
    queryKey: ["messages", containerId],
    queryFn: () => getMessages(containerId),
    // Mirrors Android's ChatViewModel: poll only while the chat screen is
    // on-screen, cancelled the moment it isn't (refetchIntervalInBackground
    // stays false so backgrounding the app also stops it).
    refetchInterval: isFocused ? 3000 : false,
    refetchIntervalInBackground: false,
  });

  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: (params: {
      body: string;
      type?: string;
      mediaUrl?: string;
      mediaName?: string;
      mediaMimeType?: string;
      enrichedMentions?: { user_id: string; display_name: string }[];
      replyToId?: string;
      forwardedFromName?: string;
    }) => sendMessage({ containerId, ...params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", containerId] });
      queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  });

  const react = useMutation({
    mutationFn: (params: { messageId: string; emoji: string }) =>
      reactToMessage(params.messageId, params.emoji),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", containerId] });
    },
  });

  const remove = useMutation({
    mutationFn: (messageId: string) => deleteMessage(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", containerId] });
    },
  });

  const edit = useMutation({
    mutationFn: (params: { messageId: string; body: string }) =>
      editMessage(params.messageId, params.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", containerId] });
    },
  });

  const pin = useMutation({
    mutationFn: (params: { messageId: string; pinned: boolean }) =>
      setMessagePinned(params.messageId, params.pinned),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", containerId] });
    },
  });

  const star = useMutation({
    mutationFn: (params: { messageId: string; starred: boolean }) =>
      (params.starred ? starMessage : unstarMessage)(params.messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", containerId] });
    },
  });

  const vote = useMutation({
    mutationFn: (params: { pollId: string; optionIndex: number }) => votePoll(params.pollId, params.optionIndex),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", containerId] });
    },
  });

  return { ...query, send, react, remove, edit, pin, star, vote };
}
