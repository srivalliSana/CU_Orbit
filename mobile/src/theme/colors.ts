// Ported from app/src/main/res/values/colors.xml's "CU Orbit Redesign
// Palette" — the one real, defined brand color system in the project — so
// the new app matches the intended look instead of placeholder colors.
export const lightColors = {
  background: "#FFFFFF", // surface_1
  surface: "#F1F5F9", // surface_2
  border: "#E2E8F0", // border
  text: "#0F172A", // text_primary
  textMuted: "#475569", // text_secondary
  primary: "#1E40AF", // orbit_primary
  accent: "#38BDF8", // orbit_accent
  primaryText: "#FFFFFF", // on_accent
  bubbleSelf: "#EFF6FF", // orbit_blue_bg
  bubbleOther: "#F1F5F9", // surface_2
  success: "#10B981", // orbit_success
  warning: "#F59E0B", // orbit_warning
  danger: "#EF4444", // orbit_error / fill_danger
};

export const darkColors = {
  background: "#0B1220",
  surface: "#161F2E",
  border: "#293548",
  text: "#E2E8F0",
  textMuted: "#94A3B8",
  primary: "#5B8DEF",
  accent: "#38BDF8",
  primaryText: "#FFFFFF",
  bubbleSelf: "#1E3A5F",
  bubbleOther: "#1B2536",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#F87171",
};

export type ThemeColors = typeof lightColors;

// Static default export kept for any call site outside a component (e.g.
// module-scope constants); components that want live theme switching should
// use useThemeColors() from state/themeStore instead.
export const colors = lightColors;
