import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { updateProfile } from "../../api/users";
import { useAuthStore } from "../../state/authStore";
import { useThemeColors } from "../../state/themeStore";

const STEPS = [
  {
    icon: "👋",
    title: "Welcome to Let's Connect",
    body: "Your campus workspace for channels, direct messages, and everything in between — let's get you oriented.",
  },
  {
    icon: "#️⃣",
    title: "Channels & direct messages",
    body: "Channels are shared spaces for a class, club, or project — anyone can join a public one. DMs are just between you and one other person.",
  },
  {
    icon: "🧵",
    title: "Threads, search & mentions",
    body: "Reply in a thread to keep a side-conversation tidy. Tap Search to find any message — try from:name or in:channel. @mention someone to make sure they see it.",
  },
];

/** One-time welcome flow shown after first sign-in — gated by
 *  User.has_onboarded (not local storage), so it stays dismissed across
 *  devices/reinstalls. Mirrors web's OnboardingScreen.jsx. */
export default function OnboardingScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const last = step === STEPS.length - 1;
  const { icon, title, body } = STEPS[step];

  const finish = async () => {
    setFinishing(true);
    try {
      const updated = await updateProfile({ has_onboarded: true });
      useAuthStore.getState().updateUser(updated);
    } catch {
      const user = useAuthStore.getState().user;
      if (user) useAuthStore.getState().updateUser({ ...user, has_onboarded: true });
    } finally {
      setFinishing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>

        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.buttonRow}>
          {step > 0 ? (
            <Pressable onPress={() => setStep((s) => s - 1)} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => (last ? finish() : setStep((s) => s + 1))}
            disabled={finishing}
            style={[styles.nextButton, finishing && styles.nextButtonDisabled]}
          >
            <Text style={styles.nextButtonText}>{finishing ? "…" : last ? "Get started" : "Next"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: colors.background,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  icon: {
    fontSize: 28,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  body: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 19,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    marginTop: 22,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.primary,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 22,
    width: "100%",
  },
  backButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  backButtonText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  nextButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    color: colors.primaryText,
    fontSize: 14,
    fontWeight: "700",
  },
});
