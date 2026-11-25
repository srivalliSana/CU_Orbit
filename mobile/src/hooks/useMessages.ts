import { useMemo } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useIsFocused } from "@react-navigation/native";

import { useAuthStore } from "../state/authStore";
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
  const currentUser = useAuthStore((s) => s.user);
  const messagesKey = ["messages", containerId];

  // Optimistic local echo, like WhatsApp's single-grey-tick bubble: the
  // message appears the instant you tap send, instead of waiting out the
  // round trip (which on a slow connection could be seconds). onMutate runs
  // synchronously before the network call even starts, so it fires exactly
  // the same whether we're online or the mutation is about to sit paused
  // offline (React Query's default networkMode pauses rather than fails a
  // mutation while there's no connection — onlineManager is wired to
  // NetInfo in App.tsx — then fires it automatically on reconnect, which is
  // the queueing behavior this needs for free). onSuccess swaps the
  // temporary entry for the server's real row in place so nothing flashes
  // or jumps; onError leaves it as a tappable "failed to send" bubble
  // rather than silently discarding what the user typed.
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
      retryTempId?: string;
    }) => sendMessage({ containerId, ...params }),
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: messagesKey });
      const previous = queryClient.getQueryData(messagesKey);
      const tempId = params.retryTempId || `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const optimistic: Message = {
        id: tempId,
        channel_id: containerId,
        dm_id: null,
        sender_id: currentUser?.id ?? "",
        sender_name: currentUser?.name ?? "You",
        sender_avatar_url: currentUser?.avatarUrl ?? null,
        text: params.body,
        sent_at: Date.now(),
        type: params.type ?? "text",
        attachments: params.mediaUrl
          ? [{ type: params.type ?? "file", url: params.mediaUrl, name: params.mediaName, mimeType: params.mediaMimeType }]
          : [],
        reactions: [],
        status: "sent",
        pending: true,
        reply_to: null,
        forwarded_from: params.forwardedFromName ? { sender_name: params.forwardedFromName } : null,
        enriched_mentions: params.enrichedMentions?.map((m) => ({ user_id: m.user_id, display_name: m.display_name, phone: "" })) ?? [],
      };

      queryClient.setQueryData(messagesKey, (old: any) => {
        if (!old) return old;
        const pages = [...old.pages];
        // pages[0] is the newest page (see the comment on `messages` above),
        // so a freshly-sent message is appended to its end.
        const withoutRetried = params.retryTempId
          ? pages[0].filter((m: Message) => m.id !== params.retryTempId)
          : pages[0];
        pages[0] = [...withoutRetried, optimistic];
        return { ...old, pages };
      });

      return { previous, tempId };
    },
    onError: (_err, _params, context) => {
      // A real failure (not an offline pause) — keep the bubble but mark it
      // failed instead of rolling it back, so the user's text isn't lost.
      queryClient.setQueryData(messagesKey, (old: any) => {
        if (!old || !context?.tempId) return old;
        const pages = old.pages.map((page: Message[]) =>
          page.map((m) => (m.id === context.tempId ? { ...m, pending: false, failed: true } : m))
        );
        return { ...old, pages };
      });
    },
    onSuccess: (data, _params, context) => {
      queryClient.setQueryData(messagesKey, (old: any) => {
        if (!old) return old;
        const pages = old.pages.map((page: Message[]) =>
          page.map((m) => (m.id === context?.tempId ? data : m))
        );
        return { ...old, pages };
      });
      queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  });

  /** Re-sends a message that's showing as failed, reusing its bubble/id. */
  const retrySend = (message: Message) =>
    send.mutate({
      body: message.text,
      type: message.type,
      mediaUrl: message.attachments?.[0]?.url,
      mediaName: message.attachments?.[0]?.name,
      mediaMimeType: message.attachments?.[0]?.mimeType,
      forwardedFromName: message.forwarded_from?.sender_name,
      retryTempId: message.id,
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
    send, retrySend, react, remove, hide, edit, pin, star, vote, action,
  };
}
