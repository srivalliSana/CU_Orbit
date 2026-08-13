import * as Linking from "expo-linking";
import type { LinkingOptions } from "@react-navigation/native";

import type { DrawerParamList } from "./types";

// cuorbit://auth is consumed directly by WebBrowser.openAuthSessionAsync in
// useAuthSession and never reaches this config.
export const linking: LinkingOptions<DrawerParamList> = {
  prefixes: [Linking.createURL("/"), "cuorbit://", "https://cuorbit.app"],
  config: {
    screens: {
      Tabs: {
        path: "",
        screens: {
          HomeTab: {
            screens: {
              JoinChannel: "join/:code",
            },
          },
        },
      },
    },
  },
};
