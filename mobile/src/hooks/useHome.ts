import { useQuery } from "@tanstack/react-query";

import { getHome } from "../api/home";
import { DEFAULT_WORKSPACE_ID } from "../constants/config";

export function useHome(workspaceId: string = DEFAULT_WORKSPACE_ID) {
  return useQuery({
    queryKey: ["home", workspaceId],
    queryFn: () => getHome(workspaceId),
  });
}
