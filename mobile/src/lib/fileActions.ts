import { Alert, Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";

const FLAG_GRANT_READ_URI_PERMISSION = 1;

async function downloadToCache(url: string, fileName: string) {
  const destination = new File(Paths.cache, fileName);
  return File.downloadFileAsync(url, destination, { idempotent: true });
}

// Real "open with the app registered for this file type, or ask which app"
// behaviour (ACTION_VIEW) — not the share sheet, which is a different
// Android intent (ACTION_SEND). getContentUriAsync wraps the download in the
// FileProvider content:// URI ACTION_VIEW requires; Expo's build already
// registers that provider, no manual native config needed.
export async function openFile(url: string, fileName: string, mimeType?: string) {
  if (Platform.OS !== "android") {
    // iOS has no equivalent chooser API in Expo; fall back to sharing.
    try {
      const file = await downloadToCache(url, fileName);
      await Sharing.shareAsync(file.uri, { dialogTitle: `Open ${fileName}` });
    } catch (e) {
      Alert.alert("Couldn't open file", e instanceof Error ? e.message : "Please try again.");
    }
    return;
  }
  try {
    const file = await downloadToCache(url, fileName);
    const contentUri = await FileSystemLegacy.getContentUriAsync(file.uri);
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      type: mimeType,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
  } catch (e) {
    Alert.alert("Couldn't open file", e instanceof Error ? e.message : "Please try again.");
  }
}

// Saving to a user-chosen location has no dedicated API in this Expo SDK
// without a new native dependency — the share sheet is the practical
// stand-in; most Android share sheets include a "Save to device"/Files
// target among the apps offered.
export async function saveFile(url: string, fileName: string) {
  try {
    const file = await downloadToCache(url, fileName);
    await Sharing.shareAsync(file.uri, { dialogTitle: `Save ${fileName}` });
  } catch (e) {
    Alert.alert("Couldn't save file", e instanceof Error ? e.message : "Please try again.");
  }
}
