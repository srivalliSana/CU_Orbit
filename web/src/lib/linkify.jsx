import React from 'react';

const URL_RE = /(https?:\/\/[^\s<]+)/g;

/** Splits text on URLs and renders each match as a real link. */
export function linkify(text, linkClassName) {
  if (!text) return text;
  // String.split with one capturing group alternates plain/matched/plain/…
  // — odd indices are always the captured URL, never re-run .test() on a
  // stateful global regex (its lastIndex would make alternate calls lie).
  const parts = text.split(URL_RE);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      // eslint-disable-next-line react/no-array-index-key
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={linkClassName || 'underline underline-offset-2'}
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}
