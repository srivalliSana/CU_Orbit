import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import { registerPushToken } from "../api/push";
import { useAuthStore } from "../state/authStore";
import { useNotificationStatusStore } from "../state/notificationStatusStore";
import { navigateToChat } from "../navigation/navigationRef";

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
 * The actual registration flow, pulled out of the hook so Settings can
 * also call it directly as a manual "Retry" — every step now reports
 * into notificationStatusStore instead of a silent empty catch, since a
 * release build has no attached console to see a swallowed error in.
 */
export async function registerForPushNotifications() {
  const setStatus = useNotificationStatusStore.getState().set;
  setStatus("registering");
  try {
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
    if (!granted) {
      setStatus("permission_denied");
      return;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      setStatus("error", "No EAS projectId in this build's config.");
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) {
      setStatus("error", "Device returned no push token.");
      return;
    }
    await registerPushToken(token);
    setStatus("registered");
  } catch (e) {
    // The classic cause here is FCM not being initialized on this device
    // build ("Default FCM app is not initialized"), but surfacing the
    // real message beats guessing — this used to be a bare empty catch,
    // so every past failure here was completely invisible.
    setStatus("error", e instanceof Error ? e.message : String(e));
  }
}

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

  // Tapping a push (or a foreground banner) jumps straight to that chat —
  // registered once, independent of sign-in status, since a tap can arrive
  // from a notification that was delivered before this mount.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const containerId = data?.container_id;
      const messageId = data?.message_id;
      if (typeof containerId === "string") {
        navigateToChat(containerId, typeof messageId === "string" ? messageId : undefined);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (status !== "signedIn") return;
    registerForPushNotifications();
  }, [status]);
}
