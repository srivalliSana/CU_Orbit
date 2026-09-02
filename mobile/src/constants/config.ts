export const API_BASE_URL = "https://cumess.cutm.ac.in/api";

export const APP_SCHEME = "cuorbit";

// The "Android" OAuth client from Google Cloud Console — a public client (no
// secret), tied to this app's package name + signing certificate SHA-1.
export const GOOGLE_ANDROID_CLIENT_ID =
  "507457795270-i6l7709j47q1nki3da2epq2r239h1dqj.apps.googleusercontent.com";

// Google's Android OAuth client type requires the redirect URI's scheme to be
// this exact "reversed client ID" form — not an arbitrary app scheme like
// cuorbit://. Using the app's own scheme here silently produces a bare
// "cuorbit://" redirect (no path), which Google's authorization server
// rejects outright with "Access blocked: Authorisation error / Error 400:
// invalid_request". This scheme must also be registered in app.json's
// android.intentFilters so Android actually routes the redirect back into
// the app — it's not inferred automatically.
export const GOOGLE_REVERSED_CLIENT_ID =
  `com.googleusercontent.apps.${GOOGLE_ANDROID_CLIENT_ID.replace('.apps.googleusercontent.com', '')}`;

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
