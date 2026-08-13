import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useThemeColors } from "../../state/themeStore";

// The server has no "list my threads" endpoint yet — Android's own thread
// UI works per-message (open a message, see its replies), not as a feed.
// This is an honest placeholder for the nav entry point rather than a
// screen built against data that doesn't exist.
export default function ThreadsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.center}>
      <Text style={styles.text}>Thread replies aren't available as a list yet.</Text>
      <Text style={styles.subtext}>Open a message's replies from inside a chat instead.</Text>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 8,
  },
  text: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
  subtext: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },
});
