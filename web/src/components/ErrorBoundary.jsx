import React from 'react';

// Nothing today catches a render error — it white-screens with no recovery
// UI. This is the top-level net, mirroring App.jsx's existing 'error' state
// screen for the sign-in step.
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
          <div className="max-w-sm text-center">
            <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">Something went wrong</p>
            <p className="mt-2 text-sm text-slate-500">{this.state.error.message}</p>
            <button
              onClick={() => location.reload()}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
