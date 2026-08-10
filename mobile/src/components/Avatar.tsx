import { Image, StyleSheet, Text, View } from "react-native";

import { colorFor, initials } from "../lib/format";

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
}

export default function Avatar({ name, url, size = 44 }: AvatarProps) {
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  if (url) {
    return <Image source={{ uri: url }} style={[styles.image, dimensionStyle]} />;
  }

  return (
    <View style={[styles.fallback, dimensionStyle, { backgroundColor: colorFor(name) }]}>
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
