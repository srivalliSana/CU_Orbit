const KEY = 'orbit_theme_mode';   // 'system' | 'light' | 'dark'

export const getThemeMode = () => {
  try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
};

export const setThemeMode = (mode) => {
  try { localStorage.setItem(KEY, mode); } catch { /* private mode */ }
  applyTheme(mode);
};

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function applyTheme(mode = getThemeMode()) {
  const dark = mode === 'dark' || (mode === 'system' && !!media?.matches);
  document.documentElement.classList.toggle('dark', dark);
}

/** Call once at app boot: applies the stored preference and keeps 'system' mode live. */
export function initTheme() {
  applyTheme();
  media?.addEventListener('change', () => {
    if (getThemeMode() === 'system') applyTheme('system');
  });
}
