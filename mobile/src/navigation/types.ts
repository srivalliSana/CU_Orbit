import type { NavigatorScreenParams } from "@react-navigation/native";

// Shared shape for both the Chats (DMs) and Channels tabs — each gets its
// own independent stack instance with this same param list.
export type ChatStackParamList = {
  List: undefined;
  Chat: { containerId: string; title: string; kind: "channel" | "dm" };
};

export type TabParamList = {
  ChatsTab: NavigatorScreenParams<ChatStackParamList>;
  ChannelsTab: NavigatorScreenParams<ChatStackParamList>;
  ProfileTab: undefined;
};

export type DrawerParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
};

export type AuthStackParamList = {
  SignIn: undefined;
};
