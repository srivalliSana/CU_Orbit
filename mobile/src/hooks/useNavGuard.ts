import { useCallback, useRef } from "react";

/**
 * Same double-tap protection as useDebouncedCallback, but as a reusable
 * "guard" function instead of wrapping one fixed callback — needed for list
 * rows where each item's onPress closes over different params and can't
 * each call a hook individually. One guard per list, shared across rows:
 *
 *   const guard = useNavGuard();
 *   <Pressable onPress={() => guard(() => navigation.navigate("Chat", {...item}))} />
 */
export function useNavGuard(delayMs = 600) {
  const lastRef = useRef(0);
  return useCallback(
    (fn: () => void) => {
      const now = Date.now();
      if (now - lastRef.current < delayMs) return;
      lastRef.current = now;
      fn();
    },
    [delayMs]
  );
}
