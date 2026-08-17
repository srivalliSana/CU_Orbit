import { client } from "./client";
import { useAuthStore } from "../state/authStore";
import type { User } from "../types/api";

export const listUsers = () => client.get<User[]>("/users").then((res) => res.data);

// Any signed-in user may look up any other by id — how tapping a name on a
// message opens their profile card, unrelated to the CampusOne directory
// search (which stays faculty-only).
export const getUser = (id: string) => client.get<User>(`/users/${encodeURIComponent(id)}`).then((res) => res.data);

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
