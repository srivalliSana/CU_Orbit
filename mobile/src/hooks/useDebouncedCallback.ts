import { useCallback, useRef } from "react";

/**
 * Guards against a double-tap firing the wrapped callback twice before its
 * effect (most commonly a screen navigation) lands — two rapid taps on the
 * same row both read the pre-navigation state and each push their own
 * screen, since React Navigation's current-route check only protects
 * against a *second* dispatch that lands after the first one's already
 * applied, not two dispatches fired in the same tick.
 */
export function useDebouncedCallback<T extends (...args: never[]) => void>(fn: T, delayMs = 600): T {
  const lastRef = useRef(0);
  return useCallback(
    ((...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastRef.current < delayMs) return;
      lastRef.current = now;
      fn(...args);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }) as T,
    [fn, delayMs]
  );
}
