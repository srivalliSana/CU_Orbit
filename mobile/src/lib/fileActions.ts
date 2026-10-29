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
  // Uploaded filenames keep spaces/parens/unicode from the original name
  // (e.g. "Field report (1).mp4"), stored as-is in the URL. The video/image
  // players tolerate that raw URL fine, but downloadFileAsync needs a
  // properly escaped URI and throws — encodeURI is a no-op on anything
  // already percent-encoded, so this is safe either way.
  return File.downloadFileAsync(encodeURI(url), destination, { idempotent: true });
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
    Alert.alert("Couldn't open file", e instanceof Error ? e.message : "This file isn't downloaded yet — connect to the internet once to fetch it, then it'll open offline too.");
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
 *  has Photos backup on, no share-sheet gamble).
 *
 *  Three outcomes, not two — "denied" has to be distinct from "error":
 *  the caller previously only checked for a truthy return, so a denied
 *  permission (which already shows its own "Photo access needed" alert)
 *  silently fell through to the share sheet right after, making a save
 *  look like it mysteriously turned into a share every time. */
async function saveMediaToLibrary(file: File, fileName: string): Promise<"saved" | "denied" | "error"> {
  try {
    // write-only: saving a new file doesn't need read access to the
    // existing library. Without this, Android 13+'s "select photos you
    // allow" limited-access picker kicks in — if the user doesn't pick
    // anything there (irrelevant for a fresh save), `granted` comes back
    // false and this falls through to the share sheet below instead of
    // actually saving.
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      Alert.alert("Photo access needed", "Enable photo library access in settings to save images and videos.");
      return "denied";
    }
    // saveToLibraryAsync is a removed legacy method as of SDK 57's rewritten
    // (class-based) expo-media-library — it throws unconditionally now. The
    // real API is MediaLibrary.Asset.create(uri), which is what actually
    // writes the file into the device's media store.
    await MediaLibrary.Asset.create(file.uri);
    Alert.alert("Saved", `${fileName} saved to your photo library.`);
    return "saved";
  } catch (e) {
    console.error("[saveMediaToLibrary]", e instanceof Error ? e.message : e);
    return "error";
  }
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
    Alert.alert("Couldn't save file", e instanceof Error ? e.message : "This file isn't downloaded yet — connect to the internet once to fetch it, then it'll save offline too.");
    return;
  }

  if (mimeType?.startsWith("image/") || mimeType?.startsWith("video/")) {
    const result = await saveMediaToLibrary(file, fileName);
    if (result === "saved") return;
    // "denied" already showed its own alert explaining why — opening the
    // share sheet right after that would look like the save silently
    // turned into something else. Only an unexpected "error" falls
    // through to share as a last resort.
    if (result === "denied") return;
  } else if (Platform.OS === "android") {
    try {
      if (await saveDocumentViaSAF(file, fileName, mimeType)) return;
    } catch (e) {
      console.error("[saveDocumentViaSAF]", e instanceof Error ? e.message : e);
    }
  }

  try {
    await Sharing.shareAsync(file.uri, { dialogTitle: `Save ${fileName}` });
  } catch (e) {
    Alert.alert("Couldn't save file", e instanceof Error ? e.message : "Please try again.");
  }
}
