import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createDrawerNavigator } from "@react-navigation/drawer";
import { Button, View } from "react-native";
import type { DrawerContentComponentProps } from "@react-navigation/drawer";

import ChatsScreen from "../screens/home/ChatsScreen";
import ChannelsScreen from "../screens/channels/ChannelsScreen";
import ChatScreen from "../screens/chat/ChatScreen";
import ProfileScreen from "../screens/profile/ProfileScreen";
import { useAuthSession } from "../hooks/useAuthSession";
import { colors } from "../theme/colors";
import type { ChatStackParamList, DrawerParamList, TabParamList } from "./types";

// Chats and Channels are two independent instances of the same stack shape
// (list -> chat), split out of what used to be one unified Home screen.
const ChatsStack = createNativeStackNavigator<ChatStackParamList>();
function ChatsStackNavigator() {
  return (
    <ChatsStack.Navigator>
      <ChatsStack.Screen name="List" component={ChatsScreen} options={{ title: "Chats" }} />
      <ChatsStack.Screen name="Chat" component={ChatScreen} />
    </ChatsStack.Navigator>
  );
}

const ChannelsStack = createNativeStackNavigator<ChatStackParamList>();
function ChannelsStackNavigator() {
  return (
    <ChannelsStack.Navigator>
      <ChannelsStack.Screen name="List" component={ChannelsScreen} options={{ title: "Channels" }} />
      <ChannelsStack.Screen name="Chat" component={ChatScreen} />
    </ChannelsStack.Navigator>
  );
}

const Tab = createBottomTabNavigator<TabParamList>();
function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="ChatsTab" component={ChatsStackNavigator} options={{ title: "Chats" }} />
      <Tab.Screen name="ChannelsTab" component={ChannelsStackNavigator} options={{ title: "Channels" }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: "You" }} />
    </Tab.Navigator>
  );
}

// No real multi-workspace switching exists server-side yet (single "default"
// workspace) — this drawer intentionally doesn't invent a fake switcher UI,
// it's the sign-out affordance the plan calls for as an app-shell element.
function DrawerContent({ navigation }: DrawerContentComponentProps) {
  const { user, signOut } = useAuthSession();
  return (
    <View style={{ flex: 1, padding: 24, paddingTop: 56, backgroundColor: colors.background }}>
      <View style={{ marginBottom: 24 }}>
        <Button title="Chats" onPress={() => navigation.navigate("Tabs", { screen: "ChatsTab" })} />
      </View>
      <Button title={`Sign out (${user?.name ?? ""})`} color={colors.danger} onPress={signOut} />
    </View>
  );
}

const Drawer = createDrawerNavigator<DrawerParamList>();
export default function AppShell() {
  return (
    <Drawer.Navigator
      screenOptions={{ headerShown: false }}
      drawerContent={(props) => <DrawerContent {...props} />}
    >
      <Drawer.Screen name="Tabs" component={Tabs} />
    </Drawer.Navigator>
  );
}
