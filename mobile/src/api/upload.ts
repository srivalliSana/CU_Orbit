import { File, UploadType } from "expo-file-system";

import { API_BASE_URL } from "../constants/config";
import { useAuthStore } from "../state/authStore";

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

/**
 * Uses expo-file-system's File.upload() rather than fetch()+FormData: RN's
 * FormData/fetch multipart path throws "Unsupported FormDataPart
 * implementation" for a { uri, name, type } file part on this RN version —
 * a known incompatibility, not something fixable on the FormData shape.
 * File.upload() streams the multipart body natively and sidesteps it.
 */
export async function uploadFile(file: PickedFile): Promise<{ url: string; name: string }> {
  const token = useAuthStore.getState().token;

  let result;
  try {
    const fsFile = new File(file.uri);
    // File.upload() has no filename option — it always advertises the
    // local cache file's own basename in the multipart header, which for
    // a content:// pick is often a meaningless generated name, not what
    // the user actually picked. The server prefers this query param over
    // that header when present (see desiredUploadName() in server.js).
    const uploadUrl = `${API_BASE_URL}/upload?name=${encodeURIComponent(file.name)}`;
    result = await fsFile.upload(uploadUrl, {
      httpMethod: "POST",
      uploadType: UploadType.MULTIPART,
      fieldName: "file",
      mimeType: file.mimeType,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch (e) {
    throw new Error(`Network error while uploading: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!result.status || result.status < 200 || result.status >= 300) {
    throw new Error(`Upload failed (${result.status}): ${result.body || "no response body"}`);
  }

  return JSON.parse(result.body);
}
