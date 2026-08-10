import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getMentions, markMentionRead } from "../api/mentions";

export function useMentions() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["mentions"],
    queryFn: getMentions,
  });

  const markRead = useMutation({
    mutationFn: (mentionId: string) => markMentionRead(mentionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mentions"] });
    },
  });

  return { ...query, markRead };
}
