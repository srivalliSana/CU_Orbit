import React, { useState } from 'react';

export default function PollComposerModal({ onCreate, onClose }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const updateOption = (i, value) => {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  };

  const addOption = () => setOptions((prev) => [...prev, '']);
  const removeOption = (i) => setOptions((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async (e) => {
    e.preventDefault();
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) {
      setError('Enter a question and at least 2 options.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate({ question: question.trim(), options: cleanOptions, multipleChoice });
    } catch (e) {
      setError(e.message || 'Could not create that poll.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Create poll</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {error && <p role="alert" className="mb-2 text-xs text-red-600">{error}</p>}

        <input
          autoFocus
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question"
          className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
        />

        <div className="mt-3 space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                className="min-w-0 flex-1 rounded-lg bg-slate-100 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-800 dark:text-slate-200"
              />
              {options.length > 2 && (
                <button type="button" onClick={() => removeOption(i)} className="shrink-0 text-slate-400 hover:text-slate-600">✕</button>
              )}
            </div>
          ))}
        </div>

        <button type="button" onClick={addOption} className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700">
          + Add option
        </button>

        <label className="mt-4 flex items-center justify-between gap-3">
          <span className="text-sm text-slate-700 dark:text-slate-200">Allow multiple answers</span>
          <input type="checkbox" checked={multipleChoice} onChange={(e) => setMultipleChoice(e.target.checked)} className="h-4 w-4" />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create poll'}
        </button>
      </form>
    </div>
  );
}
