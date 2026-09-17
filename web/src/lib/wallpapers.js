// Flat colors, not gradients/images — keeps this a zero-new-dependency
// feature on mobile too (no expo-linear-gradient, no upload pipeline).
// null = the default chat background (no override).
export const WALLPAPERS = [
  { key: null, label: 'Default', light: null, dark: null },
  { key: 'ocean', label: 'Ocean', light: '#DBEAFE', dark: '#1E3A5F' },
  { key: 'sunset', label: 'Sunset', light: '#FED7AA', dark: '#4A2C17' },
  { key: 'forest', label: 'Forest', light: '#D1FAE5', dark: '#1A3A2E' },
  { key: 'blossom', label: 'Blossom', light: '#FCE7F3', dark: '#3D1F35' },
  { key: 'charcoal', label: 'Charcoal', light: '#E5E7EB', dark: '#111827' },
];

export function wallpaperColor(key, isDark) {
  const preset = WALLPAPERS.find((w) => w.key === key);
  if (!preset) return null;
  return isDark ? preset.dark : preset.light;
}
