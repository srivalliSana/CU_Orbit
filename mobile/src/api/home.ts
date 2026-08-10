import { client } from "./client";
import { DEFAULT_WORKSPACE_ID } from "../constants/config";
import type { HomeFeed } from "../types/api";

// The server derives the acting user from the session — the :userId segment
// is ignored server-side, "me" just documents that (see server/server.js's
// GET /api/home/:userId/:workspaceId handler).
export const getHome = (workspaceId: string = DEFAULT_WORKSPACE_ID) =>
  client.get<HomeFeed>(`/home/me/${workspaceId}`).then((res) => res.data);
