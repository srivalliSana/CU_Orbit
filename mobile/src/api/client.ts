import axios from "axios";

import { API_BASE_URL } from "../constants/config";
import { useAuthStore } from "../state/authStore";

export const client = axios.create({
  baseURL: API_BASE_URL,
});

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clear();
    }
    return Promise.reject(error);
  }
);

/** Prefers the server's own error message (e.g. "jwt expired") over axios's generic status text. */
export function apiErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { message?: string; error?: string } } }).response;
    const detail = response?.data?.message || response?.data?.error;
    if (detail) return detail;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
