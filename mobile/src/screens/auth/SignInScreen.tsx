import { useMemo, useState } from "react";
import { ActivityIndicator, Button, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";

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
      <Text style={styles.title}>CU Orbit</Text>
      <Text style={styles.subtitle}>Sign in with your CUTM campus email</Text>

      {signingIn ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : (
        <>
          <Button title="Sign in with Google" onPress={signInWithGoogleAsync} />

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
              <Button title={sending ? "Sending…" : "Email me a code"} onPress={sendCode} disabled={sending || !email.trim()} />
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
              <Button title="Sign in" onPress={confirmCode} disabled={code.trim().length !== 6} />
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
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 16,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: 8,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    gap: 10,
    marginVertical: 4,
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
    maxWidth: 320,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
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
  formFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  link: {
    fontSize: 12,
    color: colors.primary,
  },
  linkDisabled: {
    color: colors.textMuted,
  },
  error: {
    color: colors.danger,
    textAlign: "center",
    fontSize: 13,
  },
});
