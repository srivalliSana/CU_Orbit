import React, { useState } from 'react';
import { uploadFile } from '../api/chat';

export default function PollComposerModal({ onCreate, onClose }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [correctOptionIndex, setCorrectOptionIndex] = useState(0);
  const [optionImages, setOptionImages] = useState([null, null]);
  const [uploadingIndex, setUploadingIndex] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const updateOption = (i, value) => {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  };

  const addOption = () => {
    setOptions((prev) => [...prev, '']);
    setOptionImages((prev) => [...prev, null]);
  };
  const removeOption = (i) => {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
    setOptionImages((prev) => prev.filter((_, idx) => idx !== i));
    if (correctOptionIndex >= i && correctOptionIndex > 0) setCorrectOptionIndex((c) => c - 1);
  };

  const pickImage = async (i, file) => {
    if (!file) return;
    setUploadingIndex(i);
    try {
      const { url } = await uploadFile(file);
      setOptionImages((prev) => prev.map((u, idx) => (idx === i ? url : u)));
    } catch {
      setError("Couldn't upload that image — try again.");
    } finally {
      setUploadingIndex(null);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const cleanOptions = options.map((o) => o.trim());
    const nonEmptyCount = cleanOptions.filter(Boolean).length;
    if (!question.trim() || nonEmptyCount < 2) {
      setError(`Enter a question and at least 2 ${quizMode ? 'answers' : 'options'}.`);
      return;
    }
    if (quizMode && !cleanOptions[correctOptionIndex]) {
      setError('Pick the correct answer.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        question: question.trim(),
        options: cleanOptions.filter(Boolean),
        multipleChoice,
        quizMode,
        correctOptionIndex: quizMode ? correctOptionIndex : undefined,
        optionImages: quizMode ? optionImages.filter((_, i) => cleanOptions[i]) : undefined,
      });
    } catch (e) {
      setError(e.message || `Could not create that ${quizMode ? 'quiz' : 'poll'}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{quizMode ? 'Create quiz' : 'Create poll'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {error && <p role="alert" className="mb-2 text-xs text-red-600">{error}</p>}

        <label className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-accent-50 px-3 py-2 dark:bg-accent-900/20">
          <span>
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">🎯 Make this a quiz</span>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400">One correct answer, revealed after voting</span>
          </span>
          <input
            type="checkbox"
            checked={quizMode}
            onChange={(e) => { setQuizMode(e.target.checked); if (e.target.checked) setMultipleChoice(false); }}
            className="h-4 w-4 shrink-0"
          />
        </label>

        <input
          autoFocus
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={quizMode ? 'Ask a question with one right answer' : 'Ask a question'}
          className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-500/40 dark:bg-slate-800 dark:text-slate-200"
        />

        <div className="mt-3 space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 p-1.5 dark:bg-slate-800/60">
              {quizMode && (
                <input
                  type="radio"
                  name="correct-option"
                  checked={correctOptionIndex === i}
                  onChange={() => setCorrectOptionIndex(i)}
                  title="Mark as the correct answer"
                  className="ml-1 h-4 w-4 shrink-0 accent-emerald-600"
                />
              )}
              {quizMode && (
                <label className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md bg-slate-200 text-slate-400 dark:bg-slate-700">
                  {optionImages[i] ? (
                    <img src={optionImages[i]} alt="" className="h-full w-full object-cover" />
                  ) : uploadingIndex === i ? (
                    <span className="text-[9px]">…</span>
                  ) : (
                    <span className="text-xs">🖼️</span>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(i, e.target.files?.[0])} />
                </label>
              )}
              <input
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                placeholder={`${quizMode ? 'Answer' : 'Option'} ${i + 1}`}
                className="min-w-0 flex-1 rounded-lg bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent-500/40 dark:bg-slate-900 dark:text-slate-200"
              />
              {options.length > 2 && (
                <button type="button" onClick={() => removeOption(i)} className="shrink-0 text-slate-400 hover:text-slate-600">✕</button>
              )}
            </div>
          ))}
        </div>

        <button type="button" onClick={addOption} className="mt-2 text-xs font-medium text-accent-600 hover:text-accent-700">
          + Add {quizMode ? 'answer' : 'option'}
        </button>

        {!quizMode && (
          <label className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm text-slate-700 dark:text-slate-200">Allow multiple answers</span>
            <input type="checkbox" checked={multipleChoice} onChange={(e) => setMultipleChoice(e.target.checked)} className="h-4 w-4" />
          </label>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
        >
          {busy ? 'Creating…' : quizMode ? 'Create quiz' : 'Create poll'}
        </button>
      </form>
    </div>
  );
}
