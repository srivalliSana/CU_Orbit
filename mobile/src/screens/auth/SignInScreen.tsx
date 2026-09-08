import { useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAuthSession } from "../../hooks/useAuthSession";
import { useThemeColors } from "../../state/themeStore";

export default function SignInScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { signingIn, error, signInWithGoogleAsync, requestOtp, verifyOtp } = useAuthSession();

  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const sendCode = async () => {
    setSending(true);
    const ok = await requestOtp(email.trim().toLowerCase());
    setSending(false);
    if (ok) {
      setStage("code");
      setResendIn(45);
      const timer = setInterval(() => {
        setResendIn((s) => {
          if (s <= 1) { clearInterval(timer); return 0; }
          return s - 1;
        });
      }, 1000);
    }
  };

  const confirmCode = async () => {
    await verifyOtp(email.trim().toLowerCase(), code.trim());
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <View style={styles.logo}>
          <Ionicons name="planet" size={32} color="#fff" />
        </View>
        <Text style={styles.title}>Let's Connect</Text>
        <Text style={styles.subtitle}>Sign in with your CUTM campus email</Text>

        {signingIn ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        ) : (
          <>
            <Pressable
              style={({ pressed }) => [styles.googleButton, pressed && styles.buttonPressed]}
              onPress={signInWithGoogleAsync}
            >
              <Ionicons name="logo-google" size={18} color="#4285F4" />
              <Text style={styles.googleButtonText}>Sign in with Google</Text>
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {stage === "email" ? (
              <View style={styles.form}>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@cutm.ac.in"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    (sending || !email.trim()) && styles.buttonDisabled,
                    pressed && !sending && email.trim() && styles.buttonPressed,
                  ]}
                  onPress={sendCode}
                  disabled={sending || !email.trim()}
                >
                  <Text style={styles.primaryButtonText}>{sending ? "Sending…" : "Email me a code"}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.form}>
                <Text style={styles.codeHint}>Code sent to {email}</Text>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="6-digit code"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={[styles.input, styles.codeInput]}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    code.trim().length !== 6 && styles.buttonDisabled,
                    pressed && code.trim().length === 6 && styles.buttonPressed,
                  ]}
                  onPress={confirmCode}
                  disabled={code.trim().length !== 6}
                >
                  <Text style={styles.primaryButtonText}>Sign in</Text>
                </Pressable>
                <View style={styles.formFooter}>
                  <Text style={styles.link} onPress={() => { setStage("email"); setCode(""); }}>
                    Use a different email
                  </Text>
                  <Text
                    style={[styles.link, resendIn > 0 && styles.linkDisabled]}
                    onPress={resendIn > 0 ? undefined : sendCode}
                  >
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </KeyboardAvoidingView>
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
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 22,
    textAlign: "center",
  },
  spinner: {
    marginVertical: 12,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: colors.background,
  },
  googleButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 10,
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  form: {
    width: "100%",
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  codeInput: {
    textAlign: "center",
    letterSpacing: 6,
    fontSize: 18,
  },
  codeHint: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
  },
  primaryButton: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.primaryText,
    fontSize: 14,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  formFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  link: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
  },
  linkDisabled: {
    color: colors.textMuted,
  },
  error: {
    color: colors.danger,
    textAlign: "center",
    fontSize: 13,
    marginTop: 14,
  },
});
