import { useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAuthSession } from "../../hooks/useAuthSession";
import { useThemeColors } from "../../state/themeStore";

export default function SignInScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { signingIn, error, signInWithGoogleAsync, requestOtp, verifyOtp, twofaPending, verifyTwofa, resendTwofa, cancelTwofa } = useAuthSession();

  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [twofaCode, setTwofaCode] = useState("");
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

  const confirmTwofa = async () => {
    await verifyTwofa(twofaCode.trim());
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <View style={styles.lockPill}>
            <Ionicons name="lock-closed" size={12} color={colors.primary} />
            <Text style={styles.lockText}>University access</Text>
          </View>
        </View>

        <View style={styles.mark}>
          <Ionicons name="chatbubble-ellipses" size={26} color={colors.primaryText} />
        </View>

        <Text style={styles.title}>Welcome back.</Text>
        <Text style={styles.subtitle}>Sign in with your university account to reach your classes, teams, and conversations.</Text>

        {twofaPending ? (
          <View style={styles.form}>
            <Text style={styles.codeHint}>For extra security, we sent a code to your email</Text>
            <TextInput
              value={twofaCode}
              onChangeText={setTwofaCode}
              placeholder="6-digit code"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              style={[styles.input, styles.codeInput]}
            />
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                twofaCode.trim().length !== 6 && styles.buttonDisabled,
                pressed && twofaCode.trim().length === 6 && styles.buttonPressed,
              ]}
              onPress={confirmTwofa}
              disabled={twofaCode.trim().length !== 6}
            >
              <Text style={styles.primaryButtonText}>Confirm</Text>
            </Pressable>
            <View style={styles.formFooter}>
              <Text style={styles.link} onPress={cancelTwofa}>Cancel</Text>
              <Text style={styles.link} onPress={resendTwofa}>Resend code</Text>
            </View>
          </View>
        ) : signingIn ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        ) : (
          <>
            {stage === "email" ? (
              <View style={styles.form}>
                <Text style={styles.label}>University email</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="mail-outline" size={16} color={colors.textMuted} />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="name@cutm.ac.in"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    style={styles.input}
                  />
                </View>

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
                  {!sending && <Ionicons name="arrow-forward" size={16} color={colors.primaryText} />}
                </Pressable>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                <Pressable
                  style={({ pressed }) => [styles.googleButton, pressed && styles.buttonPressed]}
                  onPress={signInWithGoogleAsync}
                >
                  <Ionicons name="logo-google" size={16} color={colors.text} />
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
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

        <Text style={styles.footer}>Need access? <Text style={styles.footerLink}>Contact your university administrator.</Text></Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    padding: 28,
    paddingTop: 20,
    justifyContent: "center",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 24,
  },
  lockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  lockText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  mark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 28,
    maxWidth: 320,
  },
  spinner: {
    marginVertical: 12,
  },
  form: {
    width: "100%",
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.text,
  },
  codeInput: {
    textAlign: "center",
    letterSpacing: 6,
    fontSize: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  codeHint: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 4,
  },
  primaryButton: {
    flexDirection: "row",
    width: "100%",
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    marginTop: 8,
  },
  primaryButtonText: {
    color: colors.primaryText,
    fontSize: 15,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 10,
    marginVertical: 6,
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
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    paddingVertical: 14,
    backgroundColor: colors.surface,
  },
  googleButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
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
  footer: {
    marginTop: 32,
    textAlign: "center",
    fontSize: 11,
    color: colors.textMuted,
  },
  footerLink: {
    color: colors.primary,
    fontWeight: "700",
  },
});
