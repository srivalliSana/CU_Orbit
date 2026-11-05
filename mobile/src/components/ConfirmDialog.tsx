import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useThemeColors } from "../state/themeStore";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** Tints the confirm button red, for delete/deactivate/remove actions. */
  destructive?: boolean;
}

interface PendingRequest extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let setPending: ((req: PendingRequest | null) => void) | null = null;

/** Drop-in replacement for the Cancel/destructive-action shape of
 *  Alert.alert(title, message, [{cancel}, {destructive}]) — Alert.alert
 *  renders as bare grey OS chrome that doesn't match the rest of the app
 *  (ActionSheet solved the same problem for multi-option menus; this is
 *  the two-button confirm equivalent). Usage:
 *    const ok = await confirmAsync({ title: "Remove them?", destructive: true, confirmText: "Remove" });
 *    if (!ok) return;
 */
export function confirmAsync(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    setPending?.({ ...options, resolve });
  });
}

/** Mounted once at the app root (see App.tsx) — renders whatever
 *  confirmAsync() is currently waiting on, themed to match the app. */
export default function ConfirmHost() {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  const [request, setRequest] = useState<PendingRequest | null>(null);

  useEffect(() => {
    setPending = setRequest;
    return () => { setPending = null; };
  }, []);

  if (!request) return null;

  const close = (ok: boolean) => {
    request.resolve(ok);
    setRequest(null);
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => close(false)}>
      <Pressable style={styles.backdrop} onPress={() => close(false)}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{request.title}</Text>
          {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={() => close(false)} style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}>
              <Text style={styles.cancelText}>{request.cancelText || "Cancel"}</Text>
            </Pressable>
            <Pressable onPress={() => close(true)} style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}>
              <Text style={[styles.confirmText, request.destructive && styles.confirmTextDanger]}>
                {request.confirmText || "OK"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    card: {
      width: "100%",
      maxWidth: 340,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 20,
    },
    title: { fontSize: 16, fontWeight: "700", color: colors.text },
    message: { marginTop: 8, fontSize: 13.5, lineHeight: 19, color: colors.textMuted },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 20,
      marginTop: 20,
    },
    actionBtn: { paddingVertical: 6, paddingHorizontal: 4, borderRadius: 8 },
    actionBtnPressed: { opacity: 0.6 },
    cancelText: { fontSize: 14, fontWeight: "600", color: colors.textMuted },
    confirmText: { fontSize: 14, fontWeight: "700", color: colors.primary },
    confirmTextDanger: { color: colors.danger },
  });
