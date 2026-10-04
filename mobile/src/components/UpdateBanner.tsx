import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Application from "expo-application";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";

import { getLatestVersion } from "../api/system";
import { resolveMediaUrl } from "../constants/config";
import { useThemeColors } from "../state/themeStore";

const DISMISSED_KEY = "cuorbit-update-dismissed-build";

/**
 * Sideloaded APK, no Play Store auto-update — this is the only way someone
 * finds out a new build exists. Floating card, not a blocking modal: tapping
 * it opens the new APK's download URL (same file register-release wrote),
 * tapping ✕ dismisses it until a *newer* build shows up (storing the build
 * number we dismissed, not just a boolean, so the next real release still
 * nags once).
 */
export default function UpdateBanner() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [dismissedBuild, setDismissedBuild] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: ["latestVersion"],
    queryFn: getLatestVersion,
    enabled: Platform.OS === "android",
    staleTime: 1000 * 60 * 30,
    refetchInterval: 1000 * 60 * 30,
  });

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => setDismissedBuild(v ? Number(v) : null))
      .catch(() => {});
  }, []);

  if (Platform.OS !== "android" || !data?.available || !data.build_number) return null;

  const installedBuild = Number(Application.nativeBuildVersion || 0);
  if (!installedBuild || data.build_number <= installedBuild) return null;
  if (dismissedBuild === data.build_number) return null;

  const dismiss = () => {
    setDismissedBuild(data.build_number!);
    AsyncStorage.setItem(DISMISSED_KEY, String(data.build_number)).catch(() => {});
  };

  const openDownload = () => {
    const url = resolveMediaUrl(data.download_url);
    if (url) Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Pressable
        onPress={openDownload}
        style={[styles.card, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.icon}>⬆️</Text>
        <View style={styles.textCol}>
          <Text style={styles.title}>Update available{data.version ? ` — v${data.version}` : ""}</Text>
          <Text style={styles.subtitle}>Tap to download the new version and install it over this one.</Text>
        </View>
        <Pressable onPress={dismiss} style={styles.closeBtn} hitSlop={10}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 1000,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  icon: { fontSize: 20 },
  textCol: { flex: 1 },
  title: { color: "#fff", fontWeight: "700", fontSize: 14 },
  subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 4 },
  closeText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
