import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import { registerPushToken } from "../api/push";
import { useAuthStore } from "../state/authStore";

// Foreground behavior: show the banner/sound even while the app is open,
// same reasoning as the web fix — the currently-open chat is the only thing
// that shouldn't alert, and that's decided server-side (skipped when the
// recipient has no other reason to be notified), not by hiding everything
// just because the app happens to be in front.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Registers this device for push notifications once signed in: creates the
 * Android notification channel (required before the permission prompt will
 * even appear on Android 13+), requests permission, gets an Expo push token,
 * and hands it to the server so message/mention sends can push to it.
 *
 * Re-runs on every sign-in (not just once) since the token is tied to the
 * device+app install, not the account — a token fetched under a previous
 * session on the same device is still valid and cheap to re-register.
 */
export function useNotifications() {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== "signedIn") return;
    let cancelled = false;

    (async () => {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Messages",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
        });
      }

      const existing = await Notifications.getPermissionsAsync();
      let granted = existing.status === "granted";
      if (!granted && existing.canAskAgain) {
        const requested = await Notifications.requestPermissionsAsync();
        granted = requested.status === "granted";
      }
      if (!granted || cancelled) return;

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;
      try {
        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        if (!cancelled && token) await registerPushToken(token);
      } catch {
        // Best-effort — a device that can't get a push token just won't
        // receive pushes; it shouldn't block anything else in the app.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);
}
