import { createNavigationContainerRef } from "@react-navigation/native";

import type { DrawerParamList } from "./types";

/** Lets code outside a component (a push-notification tap handler) navigate
 *  imperatively, since the nested Drawer > Tabs > Stack structure has no
 *  single flat route table to type this against precisely. */
export const navigationRef = createNavigationContainerRef<DrawerParamList>();

export function navigateToChat(containerId: string) {
  if (!navigationRef.isReady()) return;
  const kind: "channel" | "dm" = containerId.includes("_") ? "dm" : "channel";
  navigationRef.navigate("Tabs", {
    screen: "HomeTab",
    params: {
      screen: "Chat",
      params: { containerId, title: kind === "dm" ? "Chat" : "Channel", kind },
    },
  } as never);
}
