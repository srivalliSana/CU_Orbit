import { API_BASE_URL } from "../constants/config";
import { useAuthStore } from "../state/authStore";

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

/**
 * Deliberately not using the shared axios `client`: FormData must set its
 * own multipart boundary header, and React Native's fetch handles a
 * { uri, name, type } file part natively (there is no browser File object
 * on this platform). Mirrors web/src/api/chat.js's uploadFile, which
 * bypasses its api() wrapper for the same reason.
 */
export async function uploadFile(file: PickedFile): Promise<{ url: string }> {
  const form = new FormData();
  // React Native's FormData accepts this shape even though it isn't a real Blob.
  form.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);

  const token = useAuthStore.getState().token;
  const res = await fetch(`${API_BASE_URL}/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}
