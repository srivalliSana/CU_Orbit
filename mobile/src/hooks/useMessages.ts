import { useMemo } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useIsFocused } from "@react-navigation/native";

import {
  deleteMessage,
  editMessage,
  getMessages,
  hideMessage,
  reactToMessage,
  sendMessage,
  sendMessageAction,
  setMessagePinned,
  starMessage,
  unstarMessage,
  votePoll,
} from "../api/messages";
import type { Message } from "../types/api";

// Matches the server's MESSAGE_PAGE_SIZE — a full page means there might be
// more/older messages to fetch; a short page means we've hit the start of
// the conversation's history.
const PAGE_SIZE = 50;

export function useMessages(containerId: string) {
  const isFocused = useIsFocused();

  const query = useInfiniteQuery({
    queryKey: ["messages", containerId],
    queryFn: ({ pageParam }: { pageParam?: number }) => getMessages(containerId, pageParam),
    initialPageParam: undefined as number | undefined,
    // Each page comes back oldest-to-newest; its first message is the
    // right `before` cursor for fetching the next (older) page. A page
    // shorter than PAGE_SIZE means there's nothing older left.
    getNextPageParam: (lastPage: Message[]) =>
      lastPage.length >= PAGE_SIZE ? lastPage[0]?.sent_at : undefined,
    // Mirrors Android's ChatViewModel: poll only while the chat screen is
    // on-screen, cancelled the moment it isn't (refetchIntervalInBackground
    // stays false so backgrounding the app also stops it). This is a
    // dropped-socket safety net, not the primary delivery path (the socket
    // is) — 3s was fine for a handful of testers but multiplies badly at
    // real concurrency (1000 users x one poll every 3s is 300+ req/s on
    // this one endpoint alone), and on an infinite query a tick refetches
    // every page already loaded, not just the newest — doubly expensive
    // for anyone who scrolled back through history. 12s keeps the safety
    // net meaningfully faster than web's (20s) without that multiplier.
    refetchInterval: isFocused ? 12000 : false,
    refetchIntervalInBackground: false,
  });

  // query.data.pages[0] is the newest batch (fetched first), later pages
  // are progressively older — reverse them so the flattened result reads
  // oldest-to-newest, the order the chat screen has always rendered in.
  const messages = useMemo(
    () => (query.data ? [...query.data.pages].reverse().flat() : undefined),
    [query.data]
  );

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

  const hide = useMutation({
    mutationFn: (messageId: string) => hideMessage(messageId),
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

  const action = useMutation({
    mutationFn: (params: { messageId: string; actionId: string; value?: string }) =>
      sendMessageAction(params.messageId, params.actionId, params.value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", containerId] });
    },
  });

  return {
    ...query,
    // Overrides query.data (the raw {pages, pageParams}) with the
    // flattened, chronological array every existing call site already
    // expects under this same property name.
    data: messages,
    loadOlder: query.fetchNextPage,
    hasOlder: !!query.hasNextPage,
    loadingOlder: query.isFetchingNextPage,
    send, react, remove, hide, edit, pin, star, vote, action,
  };
}
