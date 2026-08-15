import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createDrawerNavigator } from "@react-navigation/drawer";
import { Button, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DrawerContentComponentProps } from "@react-navigation/drawer";

import HomeScreen from "../screens/home/HomeScreen";
import ChatScreen from "../screens/chat/ChatScreen";
import ThreadsScreen from "../screens/activity/ThreadsScreen";
import MentionsScreen from "../screens/activity/MentionsScreen";
import CreateChannelScreen from "../screens/channels/CreateChannelScreen";
import ChannelInfoScreen from "../screens/channels/ChannelInfoScreen";
import JoinChannelScreen from "../screens/channels/JoinChannelScreen";
import ContactInfoScreen from "../screens/dms/ContactInfoScreen";
import NewDirectMessageScreen from "../screens/dms/NewDirectMessageScreen";
import ProfileScreen from "../screens/profile/ProfileScreen";
import SettingsScreen from "../screens/profile/SettingsScreen";
import AdminScreen from "../screens/admin/AdminScreen";
import { useAuthSession } from "../hooks/useAuthSession";
import { useThemeColors } from "../state/themeStore";
import type { ActivityStackParamList, DrawerParamList, HomeStackParamList, ProfileStackParamList, TabParamList } from "./types";

const HomeStack = createNativeStackNavigator<HomeStackParamList>();
function HomeStackNavigator() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen name="List" component={HomeScreen} options={{ title: "CU Orbit" }} />
      <HomeStack.Screen name="Chat" component={ChatScreen} />
      <HomeStack.Screen name="Threads" component={ThreadsScreen} options={{ title: "Threads" }} />
      <HomeStack.Screen name="Mentions" component={MentionsScreen} options={{ title: "Mentions" }} />
      <HomeStack.Screen
        name="CreateChannel"
        component={CreateChannelScreen}
        options={{ title: "New channel" }}
      />
      <HomeStack.Screen
        name="NewDirectMessage"
        component={NewDirectMessageScreen}
        options={{ title: "New message" }}
      />
      <HomeStack.Screen
        name="ChannelInfo"
        component={ChannelInfoScreen}
        options={{ title: "Channel info" }}
      />
      <HomeStack.Screen
        name="JoinChannel"
        component={JoinChannelScreen}
        options={{ title: "Join channel" }}
      />
      <HomeStack.Screen
        name="ContactInfo"
        component={ContactInfoScreen}
        options={{ title: "Contact info" }}
      />
    </HomeStack.Navigator>
  );
}

// A second, independent registration of Mentions/Chat so the bottom
// Activity tab has its own navigable stack rather than reaching across
// into HomeTab's — the standard pattern for tab-scoped navigation in RN.
const ActivityStack = createNativeStackNavigator<ActivityStackParamList>();
function ActivityStackNavigator() {
  return (
    <ActivityStack.Navigator>
      <ActivityStack.Screen name="Mentions" component={MentionsScreen} options={{ title: "Activity" }} />
      <ActivityStack.Screen name="Chat" component={ChatScreen} />
    </ActivityStack.Navigator>
  );
}

const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} options={{ title: "You" }} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
      <ProfileStack.Screen name="Admin" component={AdminScreen} options={{ title: "Admin" }} />
    </ProfileStack.Navigator>
  );
}

const TAB_ICONS: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
  HomeTab: "home",
  ActivityTab: "notifications",
  ProfileTab: "person",
};

const Tab = createBottomTabNavigator<TabParamList>();
function Tabs() {
  const colors = useThemeColors();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={focused ? TAB_ICONS[route.name] : (`${TAB_ICONS[route.name]}-outline` as keyof typeof Ionicons.glyphMap)}
            color={color}
            size={size}
          />
        ),
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStackNavigator} options={{ title: "Home" }} />
      <Tab.Screen name="ActivityTab" component={ActivityStackNavigator} options={{ title: "Activity" }} />
      <Tab.Screen name="ProfileTab" component={ProfileStackNavigator} options={{ title: "You" }} />
    </Tab.Navigator>
  );
}

// No real multi-workspace switching exists server-side yet (single "default"
// workspace) — this drawer intentionally doesn't invent a fake switcher UI,
// it's the sign-out affordance the plan calls for as an app-shell element.
function DrawerContent({ navigation }: DrawerContentComponentProps) {
  const { user, signOut } = useAuthSession();
  const colors = useThemeColors();
  return (
    <View style={{ flex: 1, padding: 24, paddingTop: 56, backgroundColor: colors.background }}>
      <View style={{ marginBottom: 24 }}>
        <Button title="Home" onPress={() => navigation.navigate("Tabs", { screen: "HomeTab" })} />
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
