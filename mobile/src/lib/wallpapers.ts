// Flat colors, not gradients/images — zero new native dependency
// (no expo-linear-gradient, no upload pipeline). Mirrors web/src/lib/wallpapers.js.
// null = the default chat background (no override).
export interface WallpaperPreset {
  key: string | null;
  label: string;
  light: string | null;
  dark: string | null;
}

export const WALLPAPERS: WallpaperPreset[] = [
  { key: null, label: "Default", light: null, dark: null },
  { key: "ocean", label: "Ocean", light: "#DBEAFE", dark: "#1E3A5F" },
  { key: "sunset", label: "Sunset", light: "#FED7AA", dark: "#4A2C17" },
  { key: "forest", label: "Forest", light: "#D1FAE5", dark: "#1A3A2E" },
  { key: "blossom", label: "Blossom", light: "#FCE7F3", dark: "#3D1F35" },
  { key: "charcoal", label: "Charcoal", light: "#E5E7EB", dark: "#111827" },
];

export function wallpaperColor(key: string | null, isDark: boolean): string | null {
  const preset = WALLPAPERS.find((w) => w.key === key);
  if (!preset) return null;
  return isDark ? preset.dark : preset.light;
}
