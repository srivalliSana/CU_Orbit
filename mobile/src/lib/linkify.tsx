import { Linking, Text } from "react-native";

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Splits text on URLs and renders each match as a tappable nested Text. */
export function linkify(text: string, linkStyle: object) {
  if (!text) return text;
  // String.split with one capturing group alternates plain/matched/plain/…
  const parts = text.split(URL_RE);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <Text key={i} style={linkStyle} onPress={() => Linking.openURL(part)}>
        {part}
      </Text>
    ) : (
      part
    )
  );
}
