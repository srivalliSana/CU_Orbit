import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getChannelMembers } from '../api/channels';
import { getSlashCommands } from '../api/slashCommands';
import Avatar from './Avatar';
import EmojiPicker, { useCustomEmojiMap } from './EmojiPicker';
import { renderInlineText } from '../lib/markdown';
import { EMOJI_SHORTCODES } from '../lib/emojiShortcodes';

// Matches an in-progress "@word" run at the end of the typed text.
const MENTION_TRIGGER = /(?:^|\s)@(\w*)$/;
// Matches an in-progress ":word" run at the end of the typed text —
// unclosed (no second colon yet), same "end of string" simplification as
// MENTION_TRIGGER above.
const EMOJI_TRIGGER = /(?:^|\s):(\w{2,})$/;
// A slash command is only ever the message's first token, unlike @/: which
// can appear anywhere — so this matches the whole value, not just its tail.
const SLASH_TRIGGER = /^\/(\w*)$/;

const formatDuration = (totalSeconds) => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** One button in the formatting toolbar. */
function ToolButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}   // keep focus (and selection) in the textarea
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {children}
    </button>
  );
}

export default function Composer({ chatId, isChannel, onSend, onSchedule, onTyping, replyTo, onCancelReply, onCreatePoll }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [members, setMembers] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [emojiQuery, setEmojiQuery] = useState(null);
  const [slashQuery, setSlashQuery] = useState(null);
  const [slashCommands, setSlashCommands] = useState([]);
  const [taggedUsers, setTaggedUsers] = useState([]);
  const customEmojiMap = useCustomEmojiMap();
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [formattingOpen, setFormattingOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [schedulingOpen, setSchedulingOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const fileInput = useRef(null);
  const cameraInput = useRef(null);
  const lastTyped = useRef(0);
  const box = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const secondsRef = useRef(0);
  const timerRef = useRef(null);

  // Object URL for the pending file's playback preview — only meaningful
  // for a voice recording, and revoked whenever the file changes/clears so
  // recording several notes in a row doesn't leak blob URLs.
  const fileObjectUrl = useMemo(() => (file && file.type.startsWith('audio/') ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (fileObjectUrl) URL.revokeObjectURL(fileObjectUrl); }, [fileObjectUrl]);

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

  useEffect(() => { getSlashCommands().then(setSlashCommands).catch(() => setSlashCommands([])); }, []);

  const slashSuggestions = useMemo(() => {
    if (slashQuery === null) return [];
    const q = slashQuery.toLowerCase();
    return slashCommands.filter((c) => c.command.toLowerCase().startsWith(q)).slice(0, 6);
  }, [slashCommands, slashQuery]);

  const emojiSuggestions = useMemo(() => {
    if (emojiQuery === null) return [];
    const q = emojiQuery.toLowerCase();
    const standard = EMOJI_SHORTCODES.filter(([, name]) => name.startsWith(q)).map(([emoji, name]) => ({ id: `s:${name}`, name, emoji, insert: emoji }));
    const custom = [...customEmojiMap.entries()]
      .filter(([code]) => code.slice(1, -1).toLowerCase().startsWith(q))
      .map(([code, url]) => ({ id: `c:${code}`, name: code.slice(1, -1), url, insert: code }));
    return [...standard, ...custom].slice(0, 8);
  }, [emojiQuery, customEmojiMap]);

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
    onSend({
      text: body, file,
      enrichedMentions: enrichedMentions.length ? enrichedMentions : undefined,
      replyToId: replyTo?.id,
    });
    setText('');
    setFile(null);
    setTaggedUsers([]);
    setMentionQuery(null);
    setEmojiQuery(null);
    setSlashQuery(null);
    onCancelReply?.();
    if (fileInput.current) fileInput.current.value = '';
    grow(box.current);
  };

  // GIFs send immediately on tap, like WhatsApp/Slack — not staged into the
  // text composer the way a typed emoji is.
  const sendGif = (gifUrl) => {
    onSend({ text: '', gifUrl, replyToId: replyTo?.id });
    onCancelReply?.();
    setEmojiOpen(false);
  };

  const scheduleSubmit = () => {
    const body = text.trim();
    if ((!body && !file) || !scheduleAt) return;
    const enrichedMentions = taggedUsers.filter((t) => body.includes(`@${t.display_name}`));
    onSchedule({
      text: body, file,
      enrichedMentions: enrichedMentions.length ? enrichedMentions : undefined,
      replyToId: replyTo?.id,
      sendAt: new Date(scheduleAt).toISOString(),
    });
    setText('');
    setFile(null);
    setTaggedUsers([]);
    setMentionQuery(null);
    setSchedulingOpen(false);
    setScheduleAt('');
    onCancelReply?.();
    if (fileInput.current) fileInput.current.value = '';
    grow(box.current);
  };

  const onKeyDown = (e) => {
    // Enter sends, Shift+Enter makes a new line.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  // A screenshot copied to the clipboard (Ctrl+V) attaches like a picked
  // file — same as WhatsApp Web. Falls through to normal text paste when
  // the clipboard holds no image.
  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    const blob = item.getAsFile();
    if (!blob) return;
    const ext = item.type.split('/')[1] || 'png';
    setFile(new File([blob], `pasted-image-${Date.now()}.${ext}`, { type: item.type }));
  };

  const onChange = (e) => {
    const value = e.target.value;
    setText(value);
    grow(e.target);
    const mentionMatch = value.match(MENTION_TRIGGER);
    setMentionQuery(mentionMatch ? mentionMatch[1] : null);
    const emojiMatch = value.match(EMOJI_TRIGGER);
    setEmojiQuery(emojiMatch ? emojiMatch[1] : null);
    const slashMatch = value.match(SLASH_TRIGGER);
    setSlashQuery(slashMatch ? slashMatch[1] : null);
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

  const pickEmoji = (item) => {
    const replaced = text.replace(EMOJI_TRIGGER, (m) => `${m.startsWith(' ') ? ' ' : ''}${item.insert} `);
    setText(replaced);
    setEmojiQuery(null);
    box.current?.focus();
    requestAnimationFrame(() => grow(box.current));
  };

  const pickSlashCommand = (cmd) => {
    setText(`/${cmd.command} `);
    setSlashQuery(null);
    box.current?.focus();
  };

  // Wraps the current selection (or, with nothing selected, just inserts the
  // pair at the cursor) with a marker on each side — the shared primitive
  // behind every inline formatting button (bold/italic/underline/strike/code).
  const wrapSelection = (before, after = before) => {
    const el = box.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = text.slice(start, end);
    const next = text.slice(0, start) + before + selected + after + text.slice(end);
    setText(next);
    grow(el);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + before.length;
      el.selectionEnd = start + before.length + selected.length;
    });
  };

  // Applies mapper() to every line touching the current selection — the
  // primitive behind the list/indent buttons, which act on whole lines
  // rather than an arbitrary text span.
  const mapLines = (mapper) => {
    const el = box.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = text.length;
    const before = text.slice(0, lineStart);
    const block = text.slice(lineStart, lineEnd);
    const after = text.slice(lineEnd);
    const nextBlock = block.split('\n').map(mapper).join('\n');
    const next = before + nextBlock + after;
    setText(next);
    grow(el);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = lineStart;
      el.selectionEnd = lineStart + nextBlock.length;
    });
  };

  const toggleBulletList = () => mapLines((line) => (line.startsWith('- ') ? line.slice(2) : `- ${line}`));
  const toggleNumberedList = () => {
    let n = 1;
    mapLines((line) => (/^\d+\.\s/.test(line) ? line.replace(/^\d+\.\s/, '') : `${n++}. ${line}`));
  };
  const decreaseIndent = () => mapLines((line) => line.replace(/^(\s{1,2}|- |\d+\.\s)/, ''));

  const insertLink = () => {
    const el = box.current;
    const selected = el ? text.slice(el.selectionStart, el.selectionEnd) : '';
    const url = window.prompt('Link URL');
    if (!url) return;
    if (selected) {
      wrapSelection('[', `](${url})`);
    } else {
      insertAtCursor(`[link](${url})`);
    }
  };

  const insertAtCursor = (str) => {
    const el = box.current;
    if (!el) { setText((t) => t + str); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = text.slice(0, start) + str + text.slice(end);
    setText(next);
    grow(el);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + str.length;
    });
  };

  const insertMention = () => {
    insertAtCursor('@');
    setMentionQuery('');
  };

  // Recording ends up staged in the same `file` slot a picked attachment
  // would use — the composer's existing preview/remove/send path already
  // handles anything in `file`, so a voice note needs no new send path.
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      streamRef.current = stream;
      chunksRef.current = [];
      secondsRef.current = 0;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        if (mr.keepRecording) {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          setFile(new File([blob], `Voice message (${formatDuration(secondsRef.current)}).webm`, { type: 'audio/webm' }));
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setRecordSeconds(secondsRef.current);
      }, 1000);
    } catch {
      window.alert('Microphone access is needed to record a voice message.');
    }
  };

  const stopRecording = (keep) => {
    clearInterval(timerRef.current);
    setRecording(false);
    if (mediaRecorderRef.current) mediaRecorderRef.current.keepRecording = keep;
    mediaRecorderRef.current?.stop();
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

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
      {slashSuggestions.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 z-10 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {slashSuggestions.map((c) => (
            <button
              key={c.command}
              onMouseDown={(e) => { e.preventDefault(); pickSlashCommand(c); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <span className="shrink-0 font-mono font-semibold text-blue-600 dark:text-blue-400">/{c.command}</span>
              <span className="truncate text-xs text-slate-500">{c.usage_hint || c.description}</span>
            </button>
          ))}
        </div>
      )}
      {emojiSuggestions.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 z-10 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {emojiSuggestions.map((item) => (
            <button
              key={item.id}
              onMouseDown={(e) => { e.preventDefault(); pickEmoji(item); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              {item.url ? <img src={item.url} alt={item.name} className="h-5 w-5 object-contain" /> : <span className="text-lg">{item.emoji}</span>}
              <span className="text-slate-700 dark:text-slate-200">:{item.name}:</span>
            </button>
          ))}
        </div>
      )}
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-blue-500 bg-slate-100 px-3 py-1.5 text-xs dark:bg-slate-800">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-600 dark:text-slate-300">Replying to {replyTo.sender_name}</p>
            <p className="truncate text-slate-500 dark:text-slate-400">{replyTo.text ? renderInlineText(replyTo.text, 'underline') : 'Attachment'}</p>
          </div>
          <button onClick={onCancelReply} className="ml-auto shrink-0 text-slate-400 hover:text-slate-600" aria-label="Cancel reply">✕</button>
        </div>
      )}
      {file && file.type.startsWith('audio/') ? (
        // A voice recording gets a real playback preview — hearing it back
        // before sending is what actually prevents an accidental send,
        // not just having a delete button next to a filename.
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 dark:bg-slate-800">
          <audio controls src={fileObjectUrl} className="h-8 min-w-0 flex-1" />
          <button onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ''; }}
                  className="shrink-0 text-slate-400 hover:text-slate-600" aria-label="Delete recording" title="Delete recording">🗑️</button>
        </div>
      ) : file && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs dark:bg-slate-800">
          <span className="truncate text-slate-600 dark:text-slate-300">📎 {file.name}</span>
          <button onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ''; }}
                  className="ml-auto text-slate-400 hover:text-slate-600" aria-label="Remove attachment">✕</button>
        </div>
      )}

      {formattingOpen && (
        <div className="mb-2 flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-50 px-1 py-1 dark:border-slate-700 dark:bg-slate-800">
          <ToolButton label="Bold" onClick={() => wrapSelection('**')}><span className="font-bold">B</span></ToolButton>
          <ToolButton label="Italic" onClick={() => wrapSelection('_')}><span className="italic">I</span></ToolButton>
          <ToolButton label="Underline" onClick={() => wrapSelection('<u>', '</u>')}><span className="underline">U</span></ToolButton>
          <ToolButton label="Strikethrough" onClick={() => wrapSelection('~~')}><span className="line-through">S</span></ToolButton>
          <span className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-600" />
          <ToolButton label="Insert link" onClick={insertLink}>🔗</ToolButton>
          <ToolButton label="Numbered list" onClick={toggleNumberedList}>1.</ToolButton>
          <ToolButton label="Bulleted list" onClick={toggleBulletList}>•</ToolButton>
          <ToolButton label="Decrease indent" onClick={decreaseIndent}>⇤</ToolButton>
          <span className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-600" />
          <ToolButton label="Inline code" onClick={() => wrapSelection('`')}><span className="font-mono">{'</>'}</span></ToolButton>
          <ToolButton label="Code block" onClick={() => wrapSelection('```\n', '\n```')}><span className="font-mono">{'{ }'}</span></ToolButton>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="relative shrink-0">
          <button
            onClick={() => setAttachMenuOpen((v) => !v)}
            aria-label="Attach"
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            📎
          </button>
          <input
            ref={fileInput}
            type="file"
            hidden
            onChange={(e) => { setFile(e.target.files?.[0] || null); box.current?.focus(); }}
          />
          <input
            ref={cameraInput}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            hidden
            onChange={(e) => { setFile(e.target.files?.[0] || null); box.current?.focus(); }}
          />
          {attachMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAttachMenuOpen(false)} />
              <div className="absolute bottom-full left-0 z-20 mb-2 w-48 overflow-hidden rounded-2xl bg-white py-1.5 shadow-xl ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                <button
                  onClick={() => { setAttachMenuOpen(false); fileInput.current.accept = ''; fileInput.current?.click(); }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <span className="w-4 text-center">📄</span><span>Document</span>
                </button>
                <button
                  onClick={() => { setAttachMenuOpen(false); fileInput.current.accept = 'image/*,video/*'; fileInput.current?.click(); }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <span className="w-4 text-center">🖼️</span><span>Photos &amp; videos</span>
                </button>
                <button
                  onClick={() => { setAttachMenuOpen(false); cameraInput.current?.click(); }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <span className="w-4 text-center">📷</span><span>Camera</span>
                </button>
                {isChannel && onCreatePoll && (
                  <button
                    onClick={() => { setAttachMenuOpen(false); onCreatePoll(); }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <span className="w-4 text-center">📊</span><span>Poll</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => setFormattingOpen((v) => !v)}
          aria-label="Formatting"
          title="Formatting"
          aria-pressed={formattingOpen}
          className={`shrink-0 rounded-full p-2 text-sm font-semibold ${formattingOpen ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
        >
          Aa
        </button>

        <textarea
          ref={box}
          rows={1}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder="Type a message"
          aria-label="Message"
          className="max-h-40 flex-1 resize-none rounded-2xl bg-slate-100 px-4 py-2.5 text-sm outline-none ring-blue-500/40 placeholder:text-slate-400 focus:ring-2 dark:bg-slate-800 dark:text-slate-100"
        />

        <div className="relative shrink-0">
          <button
            onClick={() => setEmojiOpen(true)}
            aria-label="Emoji"
            title="Emoji"
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            😊
          </button>
          {emojiOpen && (
            <EmojiPicker
              onPick={(e) => { insertAtCursor(e); setEmojiOpen(false); }}
              onPickGif={sendGif}
              onClose={() => setEmojiOpen(false)}
            />
          )}
        </div>

        {isChannel && (
          <button
            onClick={insertMention}
            aria-label="Mention someone"
            title="Mention someone"
            className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            @
          </button>
        )}

        {recording ? (
          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-50 px-2 py-1 dark:bg-red-950/40">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-medium tabular-nums text-red-600 dark:text-red-400">{formatDuration(recordSeconds)}</span>
            <button onClick={() => stopRecording(false)} aria-label="Cancel recording" title="Cancel" className="px-1 text-slate-400 hover:text-slate-600">✕</button>
            <button onClick={() => stopRecording(true)} aria-label="Stop and keep recording" title="Stop" className="rounded-full bg-red-500 p-1.5 text-white hover:bg-red-600">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
            </button>
          </div>
        ) : (
          <button
            onClick={startRecording}
            aria-label="Record a voice message"
            title="Record a voice message"
            className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            🎙️
          </button>
        )}

        {onSchedule && (
          <div className="relative shrink-0">
            <button
              onClick={() => setSchedulingOpen((v) => !v)}
              disabled={!text.trim() && !file}
              aria-label="Schedule for later"
              title="Schedule for later"
              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
              </svg>
            </button>
            {schedulingOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSchedulingOpen(false)} />
                <div className="absolute bottom-12 right-0 z-20 w-64 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                  <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Send later</p>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    className="w-full rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-900 dark:text-slate-200"
                  />
                  <button
                    onClick={scheduleSubmit}
                    disabled={!scheduleAt}
                    className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Schedule
                  </button>
                </div>
              </>
            )}
          </div>
        )}

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
