import type { ReactElement } from "react";
import { Linking, Text } from "react-native";

// Inline subset only (bold/italic/underline/strike/code/links) — RN's Text
// can nest Text but not block elements (lists, <pre>), so unlike the web
// renderer this doesn't attempt list/code-block layout; those markers just
// pass through as literal characters, which degrades gracefully.
const INLINE_PATTERNS: { type: string; regex: RegExp }[] = [
  { type: "code", regex: /`([^`\n]+)`/ },
  { type: "bold", regex: /\*\*([^*\n]+)\*\*/ },
  { type: "underline", regex: /<u>([^<\n]+)<\/u>/ },
  { type: "strike", regex: /~~([^~\n]+)~~/ },
  { type: "italic", regex: /_([^_\n]+)_/ },
  { type: "link", regex: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/ },
  { type: "url", regex: /(https?:\/\/[^\s]+)/ },
];

function parseInline(text: string, linkStyle: object, keyBase: string): (string | ReactElement)[] {
  if (!text) return [];
  for (const { type, regex } of INLINE_PATTERNS) {
    const match = regex.exec(text);
    if (!match) continue;
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + match[0].length);
    const beforeNodes = parseInline(before, linkStyle, `${keyBase}b`);
    const afterNodes = parseInline(after, linkStyle, `${keyBase}a`);
    const key = `${keyBase}-${type}`;
    let node: ReactElement;
    if (type === "code") {
      node = <Text key={key} style={{ fontFamily: "monospace" }}>{match[1]}</Text>;
    } else if (type === "bold") {
      node = <Text key={key} style={{ fontWeight: "700" }}>{parseInline(match[1], linkStyle, `${key}i`)}</Text>;
    } else if (type === "underline") {
      node = <Text key={key} style={{ textDecorationLine: "underline" }}>{parseInline(match[1], linkStyle, `${key}i`)}</Text>;
    } else if (type === "strike") {
      node = <Text key={key} style={{ textDecorationLine: "line-through" }}>{parseInline(match[1], linkStyle, `${key}i`)}</Text>;
    } else if (type === "italic") {
      node = <Text key={key} style={{ fontStyle: "italic" }}>{parseInline(match[1], linkStyle, `${key}i`)}</Text>;
    } else if (type === "link") {
      node = <Text key={key} style={linkStyle} onPress={() => Linking.openURL(match[2])}>{match[1]}</Text>;
    } else {
      node = <Text key={key} style={linkStyle} onPress={() => Linking.openURL(match[1])}>{match[1]}</Text>;
    }
    return [...beforeNodes, node, ...afterNodes];
  }
  return [text];
}

/** Renders the same inline formatting subset as web/src/lib/markdown.jsx, minus block-level lists/code fences. */
export function renderMarkdown(text: string, linkStyle: object) {
  return parseInline(text, linkStyle, "m");
}
