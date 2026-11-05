import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { initTheme } from './lib/theme';
import './index.css';

initTheme();

// Caches shared photos/videos/files so they're still viewable (and
// saveable) offline once opened once — see public/sw.js. Registered at
// root scope so it covers /uploads/* regardless of which page requested
// it; failure here (unsupported browser, blocked by an extension) just
// means offline media doesn't work, nothing else depends on it.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Like the mobile app: chat history, the home list, threads, mentions and
// lists all stay visible offline or on a reload with no network yet — the
// query cache is written through to localStorage and rehydrated before
// anything re-fetches, instead of showing an empty/loading page.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24 * 7,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'cuorbit-query-cache',
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7 }}
      >
        {/* No basename: the site is actually served at /portal (server.js),
            not /app — that path is only the Vite asset-URL prefix (see
            vite.config.js's base: '/app/'), a different thing entirely. */}
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
