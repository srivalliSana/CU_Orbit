import React, { useEffect, useRef, useState } from 'react';
import { editAiImage, generateAiImage, getAiMessages, sendAiMessage } from '../api/ai';
import { saveFile } from '../lib/saveFile';

const SUGGESTIONS = ['How do I pin a message?', 'How do I schedule a message for later?', 'What can you help with?'];

/** Fullscreen viewer for a CU AI generated image — zoom (wheel/double-click),
 *  save, and "edit this image" (image-to-image via a follow-up prompt). */
function AiImageViewer({ image, onClose, onEdited }) {
  const [scale, setScale] = useState(1);
  const [editing, setEditing] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [editError, setEditError] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const toggleZoom = () => setScale((s) => (s > 1 ? 1 : 2.2));
  const onWheel = (e) => {
    e.preventDefault();
    setScale((s) => Math.min(4, Math.max(1, s - e.deltaY * 0.0015)));
  };

  const applyEdit = async () => {
    const prompt = editPrompt.trim();
    if (!prompt || editing) return;
    setEditing(true);
    setEditError(null);
    try {
      const reply = await editAiImage(prompt, image.url);
      setEditPrompt('');
      setScale(1);
      onEdited(reply);
    } catch (e) {
      setEditError(e.message || "CU AI couldn't edit that image — try again.");
    } finally {
      setEditing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95">
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onWheel={onWheel}
      >
        <img
          src={image.url}
          alt="Generated"
          onDoubleClick={toggleZoom}
          className="max-h-full max-w-full cursor-zoom-in select-none object-contain transition-transform duration-150"
          style={{ transform: `scale(${scale})` }}
          draggable={false}
        />

        <button
          onClick={() => navigator.clipboard?.writeText(image.url).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1500); })}
          aria-label="Copy link"
          title={linkCopied ? 'Copied!' : 'Copy link'}
          className="absolute right-28 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
        >
          {linkCopied ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          )}
        </button>
        <button
          onClick={() => saveFile(image.url, `cu-ai-${Date.now()}.png`)}
          aria-label="Save image"
          title="Save image"
          className="absolute right-16 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="mx-auto w-full max-w-xl px-4 pb-6">
        {editError && <p className="mb-2 text-center text-xs text-red-400">{editError}</p>}
        <div className="flex items-center gap-2 rounded-2xl bg-white/10 p-1.5 pl-4 backdrop-blur-sm">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-white/60" aria-hidden="true">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          <input
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyEdit(); } }}
            placeholder="Describe a change to make to this image…"
            disabled={editing}
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
          />
          <button
            onClick={applyEdit}
            disabled={!editPrompt.trim() || editing}
            className="flex h-9 shrink-0 items-center justify-center rounded-xl bg-accent-600 px-4 text-sm font-medium text-white transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {editing ? 'Editing…' : 'Edit'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The floating "CU AI" bubble + the chat it opens. Mounted once at the
 * App root (fixed positioning), so it floats over every panel/view
 * instead of living inside any one of them.
 *
 * `openSignal` lets something outside this component (the IconRail nav
 * button) open the same modal instance — bump it (e.g. Date.now()) and
 * this opens, same as clicking the floating button itself.
 */
export default function CuAiBubble({ openSignal }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [error, setError] = useState(null);
  const [viewerImage, setViewerImage] = useState(null);
  const scroller = useRef(null);

  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);

  useEffect(() => {
    if (!open || loaded) return;
    getAiMessages()
      .then((rows) => { setMessages(rows); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [open, loaded]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages, sending, open]);

  const submit = async (value) => {
    const body = (value ?? text).trim();
    if (!body || sending) return;
    setText('');
    setError(null);
    const wantsImage = imageMode;
    setImageMode(false);
    setMessages((prev) => [...prev, { id: `pending-${Date.now()}`, role: 'user', text: wantsImage ? `🎨 ${body}` : body }]);
    setSending(true);
    try {
      const reply = await (wantsImage ? generateAiImage(body) : sendAiMessage(body));
      setMessages((prev) => [...prev, reply]);
    } catch (e) {
      setError(e.message || (wantsImage ? "CU AI couldn't generate that image — try again." : "CU AI couldn't reply — try again."));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* No floating trigger here anymore — it overlapped the composer's
          own send button. IconRail's nav icon (onOpenCuAi → openSignal)
          is the only entry point now. */}
      {open && (
        // Full screen always, opened from the nav icon — no longer a small
        // floating card over the chat (that was the old floating-bubble
        // layout, kept only at phone width before; now it's the same at
        // every size, matching the other nav destinations like Admin).
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900">
          <header className="mx-auto flex w-full max-w-3xl items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-600 text-base">✨</div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">CU AI</h2>
              <p className="text-[11px] font-medium text-accent-600 dark:text-accent-400">Always here to help</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
          </header>
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">

            <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4">
              {messages.length === 0 && loaded && (
                <div className="mb-3 flex items-end gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-600 text-sm">✨</div>
                  <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    Hey! I'm CU AI 👋 Ask me anything — about using Let's Connect, or just to chat.
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => submit(s)}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="mb-3 flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent-600 px-3 py-2 text-sm text-white">{m.text}</div>
                  </div>
                ) : (
                  <div key={m.id} className="mb-3 flex items-end gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-600 text-sm">✨</div>
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {m.text}
                      {m.image_url && (
                        <img
                          src={m.image_url}
                          alt="Generated"
                          onClick={() => setViewerImage({ url: m.image_url })}
                          className="mt-2 max-h-60 w-full cursor-zoom-in rounded-lg object-cover"
                        />
                      )}
                    </div>
                  </div>
                )
              )}

              {sending && (
                <div className="mb-3 flex items-end gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-600 text-sm">✨</div>
                  <div className="rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2.5 text-sm text-slate-400 dark:bg-slate-800">
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                    </span>
                  </div>
                </div>
              )}

              {error && <p className="text-center text-xs text-red-600">{error}</p>}
            </div>

            {imageMode && (
              <div className="flex items-center gap-1.5 border-t border-slate-200 px-3 pt-2 text-[11px] font-medium text-accent-600 dark:border-slate-800 dark:text-accent-400">
                <span>🎨 Describe an image to generate</span>
                <button onClick={() => setImageMode(false)} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
              </div>
            )}
            <div className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
              <button
                onClick={() => setImageMode((v) => !v)}
                aria-label="Generate an image instead"
                title="Generate an image instead"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                  imageMode ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                </svg>
              </button>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder={imageMode ? 'Describe an image to generate…' : 'Ask CU AI anything…'}
                rows={1}
                className="max-h-24 flex-1 resize-none rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-accent-500/40 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                onClick={() => submit()}
                disabled={!text.trim() || sending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-600 text-white transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {viewerImage && (
        <AiImageViewer
          image={viewerImage}
          onClose={() => setViewerImage(null)}
          onEdited={(reply) => {
            setMessages((prev) => [...prev, reply]);
            setViewerImage({ url: reply.image_url });
          }}
        />
      )}
    </>
  );
}
