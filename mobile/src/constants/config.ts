// API host unconfirmed — Android's RetrofitClient.kt hardcodes this same
// value, separate from the campusone.cutm.ac.in SSO domain. Must be
// reconfirmed before Phase 1 auth testing (see migration plan, "API host").
export const API_BASE_URL = "https://cumess.cutm.ac.in/api";

export const CAMPUS_ONE_URL = "https://campusone.cutm.ac.in";

export const APP_SCHEME = "cuorbit";

// Matches LoginActivity.kt's hardcoded path exactly — this is NOT the same
// as the web client's /api/config-provided connect_path ("/connect"), which
// is a different, browser-only entry point on CampusOne's side.
export const SSO_CONNECT_PATH = "/connect/mobile";

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
