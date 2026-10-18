import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClient, onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

import RootNavigator from "./src/navigation/RootNavigator";
import ErrorBoundary from "./src/components/ErrorBoundary";
import UpdateBanner from "./src/components/UpdateBanner";

// React Query has no browser navigator.onLine to fall back on in React
// Native — without this it doesn't reliably know the device is offline, so
// queries would keep attempting real network fetches (and surfacing their
// errors) instead of pausing gracefully on cached data.
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => setOnline(!!state.isConnected));
});

// Like WhatsApp: chat history, the home list, threads, mentions and lists
// all stay visible offline or on a cold start with no network yet — the
// query cache is written through to AsyncStorage and rehydrated before
// anything re-fetches, so the last-synced data renders immediately instead
// of an empty/loading screen.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A stale cached screen beats a blank one while offline; once back
      // online each screen's own refetchInterval/focus refetch catches it up.
      gcTime: 1000 * 60 * 60 * 24 * 7,
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "cuorbit-query-cache",
});

export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* react-native's own KeyboardAvoidingView relies on the OS resizing
            the window when the keyboard opens — Expo's mandatory Android
            edge-to-edge mode stopped that from happening, so the keyboard
            was covering whatever was being typed instead of the composer
            lifting above it. KeyboardProvider + this library's
            KeyboardAvoidingView (used in ChatScreen) read the keyboard
            height from native insets directly instead, which still works
            under edge-to-edge. */}
        <KeyboardProvider>
          <SafeAreaProvider>
            <PersistQueryClientProvider
              client={queryClient}
              persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7 }}
            >
              <RootNavigator />
              <UpdateBanner />
              <StatusBar style="auto" />
            </PersistQueryClientProvider>
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
