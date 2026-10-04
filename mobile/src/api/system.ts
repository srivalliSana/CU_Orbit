import { client } from "./client";

export interface LatestVersion {
  available: boolean;
  version?: string;
  build_number?: number;
  download_url?: string;
  released_at?: string;
}

/** Public — no auth required, same as the landing page's download check. */
export const getLatestVersion = () =>
  client.get<LatestVersion>("/system/latest-version").then((res) => res.data);
