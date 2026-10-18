import React, { useEffect, useRef, useState } from 'react';
import { generateAiImage, getAiMessages, sendAiMessage } from '../api/ai';

const SUGGESTIONS = ['How do I pin a message?', 'How do I schedule a message for later?', 'What can you help with?'];

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
      <button
        onClick={() => setOpen(true)}
        aria-label="Open CU AI"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent-600 text-2xl shadow-lg shadow-accent-600/40 ring-4 ring-accent-500/10 transition hover:scale-105 hover:bg-accent-700"
      >
        <span className="absolute -left-1 -top-1 rounded-md bg-orange-400 px-1.5 py-0.5 text-[9px] font-extrabold text-slate-900">AI</span>
        ✨
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/30 p-0 sm:items-center sm:p-6" onClick={() => setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-slate-900 sm:h-[640px] sm:max-h-[85vh] sm:w-[400px] sm:rounded-2xl sm:shadow-2xl"
          >
            <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-600 text-base">✨</div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">CU AI</h2>
                <p className="text-[11px] font-medium text-accent-600 dark:text-accent-400">Always here to help</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
            </header>

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
                        <img src={m.image_url} alt="Generated" className="mt-2 max-h-60 rounded-lg object-cover" />
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
    </>
  );
}
