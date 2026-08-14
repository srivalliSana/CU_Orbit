import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getChannelMembers } from '../api/channels';
import Avatar from './Avatar';

// Matches an in-progress "@word" run at the end of the typed text.
const MENTION_TRIGGER = /(?:^|\s)@(\w*)$/;

export default function Composer({ chatId, isChannel, onSend, onTyping }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [members, setMembers] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [taggedUsers, setTaggedUsers] = useState([]);
  const fileInput = useRef(null);
  const lastTyped = useRef(0);
  const box = useRef(null);

  // Only channels have a fixed member list worth tagging from — a DM is
  // already a conversation with exactly one other person.
  useEffect(() => {
    if (!isChannel || !chatId) { setMembers([]); return; }
    getChannelMembers(chatId).then(setMembers).catch(() => setMembers([]));
  }, [chatId, isChannel]);

  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [members, mentionQuery]);

  const grow = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const submit = () => {
    const body = text.trim();
    if (!body && !file) return;
    // Only keep tags whose "@Name" text is still actually present — guards
    // against a mention surviving in state after the user deleted it.
    const enrichedMentions = taggedUsers.filter((t) => body.includes(`@${t.display_name}`));
    onSend({ text: body, file, enrichedMentions: enrichedMentions.length ? enrichedMentions : undefined });
    setText('');
    setFile(null);
    setTaggedUsers([]);
    setMentionQuery(null);
    if (fileInput.current) fileInput.current.value = '';
    grow(box.current);
  };

  const onKeyDown = (e) => {
    // Enter sends, Shift+Enter makes a new line.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const onChange = (e) => {
    setText(e.target.value);
    grow(e.target);
    const match = e.target.value.match(MENTION_TRIGGER);
    setMentionQuery(match ? match[1] : null);
    // Throttle to one ping every 2s rather than one per keystroke.
    if (Date.now() - lastTyped.current > 2000) {
      lastTyped.current = Date.now();
      onTyping?.();
    }
  };

  const pickMention = (member) => {
    const replaced = text.replace(MENTION_TRIGGER, (m) => `${m.startsWith(' ') ? ' ' : ''}@${member.name} `);
    setText(replaced);
    setTaggedUsers((prev) => [...prev, { user_id: member.id, display_name: member.name }]);
    setMentionQuery(null);
    box.current?.focus();
  };

  return (
    <div className="relative border-t border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 z-10 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {suggestions.map((m) => (
            <button
              key={m.id}
              onMouseDown={(e) => { e.preventDefault(); pickMention(m); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Avatar name={m.name} url={m.avatarUrl} size={24} />
              <span className="text-slate-700 dark:text-slate-200">{m.name}</span>
            </button>
          ))}
        </div>
      )}
      {file && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs dark:bg-slate-800">
          <span className="truncate text-slate-600 dark:text-slate-300">📎 {file.name}</span>
          <button onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ''; }}
                  className="ml-auto text-slate-400 hover:text-slate-600" aria-label="Remove attachment">✕</button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={() => fileInput.current?.click()}
          aria-label="Attach a file"
          className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          📎
        </button>
        <input
          ref={fileInput}
          type="file"
          hidden
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />

        <textarea
          ref={box}
          rows={1}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="Type a message"
          aria-label="Message"
          className="max-h-40 flex-1 resize-none rounded-2xl bg-slate-100 px-4 py-2.5 text-sm outline-none ring-blue-500/40 placeholder:text-slate-400 focus:ring-2 dark:bg-slate-800 dark:text-slate-100"
        />

        <button
          onClick={submit}
          disabled={!text.trim() && !file}
          aria-label="Send message"
          className="shrink-0 rounded-full bg-blue-600 p-2.5 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
