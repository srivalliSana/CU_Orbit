import { useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { colorFor, initials } from "../lib/format";
import { useThemeColors } from "../state/themeStore";

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
  presence?: string;
}

export default function Avatar({ name, url, size = 44, presence }: AvatarProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };
  const dotSize = Math.max(10, size * 0.28);

  return (
    <View>
      {url ? (
        <Image source={{ uri: url }} style={[styles.image, dimensionStyle]} />
      ) : (
        <View style={[styles.fallback, dimensionStyle, { backgroundColor: colorFor(name) }]}>
          <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initials(name)}</Text>
        </View>
      )}
      {presence === "online" ? (
        <View
          style={[
            styles.presenceDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              right: -1,
              bottom: -1,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  image: {
    backgroundColor: "#e2e4e8",
  },
  fallback: {
    justifyContent: "center",
    alignItems: "center",
  },
  initials: {
    color: "#ffffff",
    fontWeight: "600",
  },
  presenceDot: {
    position: "absolute",
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.background,
  },
});
