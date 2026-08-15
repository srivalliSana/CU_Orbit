export const API_BASE_URL = "https://cumess.cutm.ac.in/api";

export const APP_SCHEME = "cuorbit";

// The "Android" OAuth client from Google Cloud Console — a public client (no
// secret), tied to this app's package name + signing certificate SHA-1.
export const GOOGLE_ANDROID_CLIENT_ID =
  "507457795270-i6l7709j47q1nki3da2epq2r239h1dqj.apps.googleusercontent.com";

export const DEFAULT_WORKSPACE_ID = "default";

// Mirrors RetrofitClient.kt's getAbsoluteUrl: /api/upload returns a
// server-relative "/uploads/..." path, which must be resolved against the
// bare origin (API_BASE_URL minus "/api"), not the API prefix itself.
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");
export function resolveMediaUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return path.startsWith("/") ? `${API_ORIGIN}${path}` : `${API_ORIGIN}/${path}`;
}
