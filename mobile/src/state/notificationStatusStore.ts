import { create } from "zustand";

export type NotificationStatus = "idle" | "registering" | "registered" | "permission_denied" | "error";

interface NotificationStatusState {
  status: NotificationStatus;
  error: string | null;
  set: (status: NotificationStatus, error?: string | null) => void;
}

/**
 * Push-token registration used to fail completely silently (an empty
 * catch block, no log, nothing) — in a release build there's no console
 * attached to see why, so a real failure was indistinguishable from
 * "nothing's wrong" from the user's side. This gives Settings something
 * concrete to show instead of just "notifications don't work."
 */
export const useNotificationStatusStore = create<NotificationStatusState>((set) => ({
  status: "idle",
  error: null,
  set: (status, error = null) => set({ status, error }),
}));
