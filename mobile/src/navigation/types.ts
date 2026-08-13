import type { NavigatorScreenParams } from "@react-navigation/native";

export type HomeStackParamList = {
  List: undefined;
  Chat: { containerId: string; title: string; kind: "channel" | "dm" };
  Threads: undefined;
  Mentions: undefined;
  CreateChannel: undefined;
  NewDirectMessage: undefined;
  ChannelInfo: { channelId: string };
  JoinChannel: { code: string };
  ContactInfo: { userId: string; name: string; containerId: string };
};

export type ActivityStackParamList = {
  Mentions: undefined;
  Chat: { containerId: string; title: string; kind: "channel" | "dm" };
};

export type ProfileStackParamList = {
  Profile: undefined;
  Settings: undefined;
};

export type TabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  ActivityTab: NavigatorScreenParams<ActivityStackParamList>;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
};

export type DrawerParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
};

export type AuthStackParamList = {
  SignIn: undefined;
};
