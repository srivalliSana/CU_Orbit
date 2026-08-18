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

export interface MentionRef {
  user_id: string;
  display_name: string;
}

const BROADCAST_TAGS = ["@all", "@everyone", "@channel", "@here"];

/**
 * Same as renderMarkdown, but first pulls out @mention spans (matched
 * against the message's own enriched_mentions, plus @all/@everyone/@channel/
 * @here) and renders them as tappable chips — mirrors web/src/lib/markdown.jsx's renderMessageText.
 */
export function renderMessageText(
  text: string,
  linkStyle: object,
  chipStyle: object,
  mentions: MentionRef[],
  onMentionPress?: (mention: MentionRef) => void
) {
  if (!text) return text;

  const spans: { start: number; end: number; kind: "broadcast" | "user"; label: string; mention?: MentionRef }[] = [];
  const lower = text.toLowerCase();
  for (const tag of BROADCAST_TAGS) {
    let idx = lower.indexOf(tag);
    while (idx !== -1) {
      spans.push({ start: idx, end: idx + tag.length, kind: "broadcast", label: text.slice(idx, idx + tag.length) });
      idx = lower.indexOf(tag, idx + tag.length);
    }
  }
  for (const mention of mentions || []) {
    if (!mention.display_name) continue;
    const needle = `@${mention.display_name}`;
    let idx = text.indexOf(needle);
    while (idx !== -1) {
      spans.push({ start: idx, end: idx + needle.length, kind: "user", label: needle, mention });
      idx = text.indexOf(needle, idx + needle.length);
    }
  }
  if (spans.length === 0) return renderMarkdown(text, linkStyle);

  spans.sort((a, b) => a.start - b.start);
  const clean: typeof spans = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start < cursor) continue;
    clean.push(s);
    cursor = s.end;
  }

  const pieces: (string | ReactElement)[] = [];
  let pos = 0;
  clean.forEach((s, i) => {
    if (s.start > pos) pieces.push(...parseInline(text.slice(pos, s.start), linkStyle, `t${i}`));
    pieces.push(
      <Text
        key={`m${i}`}
        style={chipStyle}
        onPress={s.kind === "user" ? () => onMentionPress?.(s.mention!) : undefined}
      >
        {s.label}
      </Text>
    );
    pos = s.end;
  });
  if (pos < text.length) pieces.push(...parseInline(text.slice(pos), linkStyle, "tend"));
  return pieces;
}
