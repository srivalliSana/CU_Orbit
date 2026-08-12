import type { NavigatorScreenParams } from "@react-navigation/native";

export type HomeStackParamList = {
  List: undefined;
  Chat: { containerId: string; title: string; kind: "channel" | "dm" };
  Threads: undefined;
  Mentions: undefined;
  CreateChannel: undefined;
  NewDirectMessage: undefined;
  ChannelInfo: { channelId: string };
};

export type ActivityStackParamList = {
  Mentions: undefined;
  Chat: { containerId: string; title: string; kind: "channel" | "dm" };
};

export type TabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  ActivityTab: NavigatorScreenParams<ActivityStackParamList>;
  ProfileTab: undefined;
};

export type DrawerParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
};

export type AuthStackParamList = {
  SignIn: undefined;
};
