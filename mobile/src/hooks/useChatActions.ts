import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { setConversationPref } from "../api/conversations";
import type { ChatRowItem } from "../components/ChatListRow";

/** Long-press action sheet for a chat/channel row — pin and mute (DND per chat). */
export function useChatActions() {
  const queryClient = useQueryClient();

  const setPin = useMutation({
    mutationFn: (params: { containerId: string; pinned: boolean }) =>
      setConversationPref(params.containerId, "pin", params.pinned),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  });

  const setMute = useMutation({
    mutationFn: (params: { containerId: string; muted: boolean; durationMinutes?: number }) =>
      setConversationPref(params.containerId, "mute", params.muted, params.durationMinutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  });

  const promptMuteDuration = (item: ChatRowItem) => {
    Alert.alert(
      "Mute notifications",
      undefined,
      [
        { text: "For 1 hour", onPress: () => setMute.mutate({ containerId: item.id, muted: true, durationMinutes: 60 }) },
        { text: "For 8 hours", onPress: () => setMute.mutate({ containerId: item.id, muted: true, durationMinutes: 480 }) },
        { text: "Until I turn it back on", onPress: () => setMute.mutate({ containerId: item.id, muted: true }) },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const onLongPress = (item: ChatRowItem) => {
    Alert.alert(
      item.title,
      undefined,
      [
        {
          text: item.isPinned ? "Unpin" : "Pin",
          onPress: () => setPin.mutate({ containerId: item.id, pinned: !item.isPinned }),
        },
        {
          text: item.isMuted ? "Unmute notifications" : "Mute notifications…",
          onPress: () => (item.isMuted ? setMute.mutate({ containerId: item.id, muted: false }) : promptMuteDuration(item)),
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  return { onLongPress };
}
