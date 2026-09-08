import { client } from "./client";
import { useAuthStore } from "../state/authStore";
import type { User } from "../types/api";

// signed_in=true excludes accounts that were only ever bulk-provisioned and
// have never actually opened the app — not a real contact yet.
export const listUsers = () => client.get<User[]>("/users?signed_in=true").then((res) => res.data);

// Any signed-in user may look up any other by id — how tapping a name on a
// message opens their profile card, unrelated to the CampusOne directory
// search (which stays faculty-only).
export const getUser = (id: string) => client.get<User>(`/users/${encodeURIComponent(id)}`).then((res) => res.data);

// "Message someone by email" — checks Let's Connect's own user table only,
// not the CampusOne roster, so open to any signed-in user. A 404 means that
// email has never signed in yet, distinct from a malformed request.
export const startDmByEmail = (email: string) =>
  client.post<{ dm_id: string; user: User }>("/directory/dm", { email }).then((res) => res.data);

export interface ProfileUpdate {
  name?: string;
  bio?: string;
  avatarUrl?: string;
  status_emoji?: string;
  status_text?: string;
}

// The path segment is ignored server-side (you may only edit your own
// profile) — the phone number there is just to satisfy the route shape.
export const updateProfile = (patch: ProfileUpdate) => {
  const phone = useAuthStore.getState().user?.id ?? "me";
  return client
    .put<{ success: boolean; user: User }>(`/users/${encodeURIComponent(phone)}`, patch)
    .then((res) => res.data.user);
};
