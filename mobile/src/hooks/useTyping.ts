import { useEffect, useRef, useState } from "react";

import * as socket from "../api/socket";
import { sendTyping as emitTyping } from "../api/socket";
import { setTyping as pingTyping } from "../api/messages";
import { useAuthStore } from "../state/authStore";

const TYPING_EXPIRY_MS = 3000;

/** Shows who's currently typing in a container, expiring stale pings locally. */
export function useTyping(containerId: string) {
  const [typingName, setTypingName] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selfId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    const unsubscribe = socket.on(
      "typing",
      (payload: { containerId: string; userId: string; name: string }) => {
        if (payload.containerId !== containerId || payload.userId === selfId) return;
        setTypingName(payload.name);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setTypingName(null), TYPING_EXPIRY_MS);
      }
    );
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [containerId, selfId]);

  const selfName = useAuthStore((s) => s.user?.name);
  const notifyTyping = () => {
    emitTyping(containerId, selfName ?? "");
    // Best-effort REST fallback for clients still on polling, mirrors web.
    pingTyping(containerId);
  };

  return { typingName, notifyTyping };
}
