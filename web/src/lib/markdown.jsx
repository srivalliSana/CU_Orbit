import React from 'react';

// Deliberately restricted: bold/italic/underline/strike/inline-code/code-block/
// links/lists — a lightweight subset (matching the Android app's own
// MarkdownUtils.kt scope), not a full markdown/CommonMark implementation.
const INLINE_PATTERNS = [
  { type: 'code', regex: /`([^`\n]+)`/ },
  { type: 'bold', regex: /\*\*([^*\n]+)\*\*/ },
  { type: 'underline', regex: /<u>([^<\n]+)<\/u>/ },
  { type: 'strike', regex: /~~([^~\n]+)~~/ },
  { type: 'italic', regex: /_([^_\n]+)_/ },
  { type: 'link', regex: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/ },
  { type: 'url', regex: /(https?:\/\/[^\s<]+)/ },
];

function parseInline(text, linkClassName, keyBase) {
  if (!text) return [];
  for (const { type, regex } of INLINE_PATTERNS) {
    const match = regex.exec(text);
    if (!match) continue;
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + match[0].length);
    const beforeNodes = parseInline(before, linkClassName, `${keyBase}b`);
    const afterNodes = parseInline(after, linkClassName, `${keyBase}a`);
    const key = `${keyBase}-${type}`;
    let node;
    if (type === 'code') {
      node = <code key={key} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10">{match[1]}</code>;
    } else if (type === 'bold') {
      node = <strong key={key}>{parseInline(match[1], linkClassName, `${key}i`)}</strong>;
    } else if (type === 'underline') {
      node = <u key={key}>{parseInline(match[1], linkClassName, `${key}i`)}</u>;
    } else if (type === 'strike') {
      node = <s key={key}>{parseInline(match[1], linkClassName, `${key}i`)}</s>;
    } else if (type === 'italic') {
      node = <em key={key}>{parseInline(match[1], linkClassName, `${key}i`)}</em>;
    } else if (type === 'link') {
      node = (
        <a key={key} href={match[2]} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={linkClassName}>
          {match[1]}
        </a>
      );
    } else {
      node = (
        <a key={key} href={match[1]} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={linkClassName}>
          {match[1]}
        </a>
      );
    }
    return [...beforeNodes, node, ...afterNodes];
  }
  return [text];
}

/** Renders a restricted markdown subset (see INLINE_PATTERNS) plus bullet/numbered lists and fenced code blocks. */
export function renderMarkdown(text, linkClassName) {
  if (!text) return text;
  const lines = text.split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null;   // { type: 'ul' | 'ol', items: string[] }

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<span key={`p-${blocks.length}`}>{parseInline(paragraph.join('\n'), linkClassName, `p${blocks.length}`)}</span>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const Tag = list.type;
    blocks.push(
      <Tag key={`l-${blocks.length}`} className={Tag === 'ul' ? 'my-1 list-disc pl-5' : 'my-1 list-decimal pl-5'}>
        {list.items.map((item, idx) => <li key={idx}>{parseInline(item, linkClassName, `li${blocks.length}-${idx}`)}</li>)}
      </Tag>
    );
    list = null;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      flushParagraph();
      flushList();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { codeLines.push(lines[i]); i++; }
      i++;   // skip the closing fence
      blocks.push(
        <pre key={`c-${blocks.length}`} className="my-1 overflow-x-auto rounded-lg bg-black/10 p-2 text-xs font-mono dark:bg-white/10">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
      list.items.push((bullet || numbered)[1]);
      i++;
      continue;
    }
    flushList();
    paragraph.push(line);
    i++;
  }
  flushParagraph();
  flushList();
  return <>{blocks}</>;
}
