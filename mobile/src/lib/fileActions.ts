import { Alert, Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import * as MediaLibrary from "expo-media-library";

const FLAG_GRANT_READ_URI_PERMISSION = 1;

// Keyed by URL (not the display filename, which can collide across
// different attachments), so a previously opened/saved attachment reopens
// instantly from cache — including with no network at all — instead of
// re-downloading every time.
function cacheKeyFor(url: string) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) | 0;
  const ext = url.split(".").pop()?.split("?")[0]?.slice(0, 8).replace(/[^a-z0-9]/gi, "") || "bin";
  return `orbit-${Math.abs(hash)}.${ext}`;
}

async function ensureCached(url: string): Promise<File> {
  const destination = new File(Paths.cache, cacheKeyFor(url));
  if (destination.exists) return destination;
  return File.downloadFileAsync(url, destination, { idempotent: true });
}

// Real "open with the app registered for this file type, or ask which app"
// behaviour (ACTION_VIEW) — not the share sheet, which is a different
// Android intent (ACTION_SEND). getContentUriAsync wraps the download in the
// FileProvider content:// URI ACTION_VIEW requires; Expo's build already
// registers that provider, no manual native config needed.
export async function openFile(url: string, fileName: string, mimeType?: string) {
  let file: File;
  try {
    file = await ensureCached(url);
  } catch (e) {
    Alert.alert("Couldn't open file", "This file isn't downloaded yet — connect to the internet once to fetch it, then it'll open offline too.");
    return;
  }
  if (Platform.OS !== "android") {
    // iOS has no equivalent chooser API in Expo; fall back to sharing.
    try {
      await Sharing.shareAsync(file.uri, { dialogTitle: `Open ${fileName}` });
    } catch (e) {
      Alert.alert("Couldn't open file", e instanceof Error ? e.message : "Please try again.");
    }
    return;
  }
  try {
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

/** Photos/videos save straight to the device's photo library — a real,
 *  guaranteed save (shows up in Google Photos, syncs to Drive if the user
 *  has Photos backup on, no share-sheet gamble). */
async function saveMediaToLibrary(file: File, fileName: string) {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    Alert.alert("Photo access needed", "Enable photo library access in settings to save images and videos.");
    return false;
  }
  await MediaLibrary.saveToLibraryAsync(file.uri);
  Alert.alert("Saved", `${fileName} saved to your photo library.`);
  return true;
}

/** Documents save through Android's Storage Access Framework — the user
 *  picks a real folder (Downloads works fine) and the file lands there
 *  under its own original name, not a share-sheet-dependent guess. */
async function saveDocumentViaSAF(file: File, fileName: string, mimeType?: string) {
  const perm = await FileSystemLegacy.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!perm.granted) return false;
  const destUri = await FileSystemLegacy.StorageAccessFramework.createFileAsync(
    perm.directoryUri,
    fileName,
    mimeType || "application/octet-stream"
  );
  const base64 = await FileSystemLegacy.readAsStringAsync(file.uri, { encoding: FileSystemLegacy.EncodingType.Base64 });
  await FileSystemLegacy.writeAsStringAsync(destUri, base64, { encoding: FileSystemLegacy.EncodingType.Base64 });
  Alert.alert("Saved", `${fileName} saved.`);
  return true;
}

export async function saveFile(url: string, fileName: string, mimeType?: string) {
  let file: File;
  try {
    file = await ensureCached(url);
  } catch (e) {
    Alert.alert("Couldn't save file", "This file isn't downloaded yet — connect to the internet once to fetch it, then it'll save offline too.");
    return;
  }

  try {
    if (mimeType?.startsWith("image/") || mimeType?.startsWith("video/")) {
      if (await saveMediaToLibrary(file, fileName)) return;
    } else if (Platform.OS === "android") {
      if (await saveDocumentViaSAF(file, fileName, mimeType)) return;
    }
  } catch (e) {
    // Any failure in the direct-save paths above falls through to the
    // share-sheet — never leave the user with no way to save at all.
  }

  try {
    await Sharing.shareAsync(file.uri, { dialogTitle: `Save ${fileName}` });
  } catch (e) {
    Alert.alert("Couldn't save file", e instanceof Error ? e.message : "Please try again.");
  }
}
