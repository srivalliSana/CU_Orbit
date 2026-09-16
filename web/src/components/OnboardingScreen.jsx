import React, { useState } from 'react';
import { updateProfile } from '../api/users';

const STEPS = [
  {
    icon: '👋',
    title: "Welcome to Let's Connect",
    body: "Your campus workspace for channels, direct messages, and everything in between — let's get you oriented.",
  },
  {
    icon: '#️⃣',
    title: 'Channels & direct messages',
    body: 'Channels are shared spaces for a class, club, or project — anyone can join a public one. DMs are just between you and one other person.',
  },
  {
    icon: '🧵',
    title: 'Threads, search & mentions',
    body: 'Reply in a thread to keep a side-conversation tidy. Use the search icon to find any message — try from:name or in:channel. @mention someone to make sure they see it.',
  },
];

/** One-time welcome flow, shown after first sign-in until dismissed —
 *  gated by User.has_onboarded, not local storage, so it stays dismissed
 *  across devices/reinstalls. */
export default function OnboardingScreen({ user, onDone }) {
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const last = step === STEPS.length - 1;
  const { icon, title, body } = STEPS[step];

  const finish = async () => {
    setFinishing(true);
    try {
      const updated = await updateProfile({ has_onboarded: true });
      onDone(updated);
    } catch {
      // Even if the write fails, don't trap the user behind onboarding —
      // move on locally; it'll just show again next sign-in.
      onDone({ ...user, has_onboarded: true });
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-3xl">
          {icon}
        </div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{body}</p>

        <div className="mt-6 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-blue-600' : 'w-1.5 bg-slate-200 dark:bg-slate-700'}`}
            />
          ))}
        </div>

        <div className="mt-6 flex gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Back
            </button>
          )}
          <button
            onClick={() => (last ? finish() : setStep((s) => s + 1))}
            disabled={finishing}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {finishing ? '…' : last ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
