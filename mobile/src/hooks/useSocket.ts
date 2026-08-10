import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import * as socket from "../api/socket";
import { useAuthStore } from "../state/authStore";

/**
 * Connects the socket once a session exists, and keeps home-feed queries
 * fresh on the events that change it. Chat screens additionally call
 * useChannelSocket to join/leave their own room.
 */
export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) {
      socket.disconnect();
      return;
    }
    socket.connect();

    const unsubs = [
      socket.on("message", () => {
        queryClient.invalidateQueries({ queryKey: ["home"] });
      }),
      socket.on("unread-changed", () => {
        queryClient.invalidateQueries({ queryKey: ["home"] });
      }),
      socket.on("channel-added", () => {
        queryClient.invalidateQueries({ queryKey: ["home"] });
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [token, queryClient]);
}

/** Joins a chat's realtime room for the lifetime of the screen. */
export function useChannelSocket(containerId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!containerId) return;
    socket.join(containerId);

    const unsubscribe = socket.on("message", (payload: { container_id: string }) => {
      if (payload.container_id === containerId) {
        queryClient.invalidateQueries({ queryKey: ["messages", containerId] });
      }
    });

    return () => {
      unsubscribe();
      socket.leave(containerId);
    };
  }, [containerId, queryClient]);
}
