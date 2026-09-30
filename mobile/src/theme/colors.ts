// Matches the web app's brand palette (see web/tailwind.config.js's
// "accent" scale and the landing page's --mint-deep/--coral tokens) so the
// two clients read as the same product. "primary" is used across ~40
// screens for icon tints, links, and button fills alike — that's the same
// broad role web's mint accent plays, so it maps there (not to coral,
// which web itself reserves for a rare CTA-button accent, not everyday
// chrome).
export const lightColors = {
  background: "#F7FBFA", // web --bg
  surface: "#EEF6F4", // web --paper-2
  border: "#D5E3E0", // web --line
  text: "#102F36", // web --ink
  textMuted: "#587279", // web --muted
  primary: "#1A8E72", // web --mint-deep
  accent: "#FF795F", // web --coral
  primaryText: "#FFFFFF", // on primary
  bubbleSelf: "#167A62", // web's own-message bubble (accent-600), same value in both themes
  bubbleOther: "#FFFFFF", // web's received-message bubble (light mode)
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
};

export const darkColors = {
  background: "#071B20", // web dark --bg
  surface: "#12323A", // web dark --paper-2
  border: "#24444A", // web dark --line
  text: "#EDF8F5", // web dark --ink
  textMuted: "#A9C3C4", // web dark --muted
  primary: "#3DC496", // brighter mint for contrast against a dark ground
  accent: "#FF876F", // web dark --coral
  primaryText: "#FFFFFF",
  bubbleSelf: "#167A62", // web's own-message bubble (accent-600) — same value as light mode, matching web exactly
  bubbleOther: "#1E293B", // web's received-message bubble in dark mode (slate-800)
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#F87171",
};

export type ThemeColors = typeof lightColors;

// Static default export kept for any call site outside a component (e.g.
// module-scope constants); components that want live theme switching should
// use useThemeColors() from state/themeStore instead.
export const colors = lightColors;
