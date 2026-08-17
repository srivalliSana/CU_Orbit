import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { useThemeColors } from "../state/themeStore";

export default function PollComposerModal({
  visible,
  onCreate,
  onClose,
}: {
  visible: boolean;
  onCreate: (params: { question: string; options: string[]; multipleChoice: boolean }) => Promise<void>;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateOption = (i: number, value: string) => {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  };
  const addOption = () => setOptions((prev) => [...prev, ""]);
  const removeOption = (i: number) => setOptions((prev) => prev.filter((_, idx) => idx !== i));

  const reset = () => {
    setQuestion("");
    setOptions(["", ""]);
    setMultipleChoice(false);
    setError(null);
  };

  const submit = async () => {
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) {
      setError("Enter a question and at least 2 options.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate({ question: question.trim(), options: cleanOptions, multipleChoice });
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create that poll.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Create poll</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Ask a question"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          {options.map((opt, i) => (
            <View key={i} style={styles.optionRow}>
              <TextInput
                value={opt}
                onChangeText={(v) => updateOption(i, v)}
                placeholder={`Option ${i + 1}`}
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.optionInput]}
              />
              {options.length > 2 ? (
                <Pressable onPress={() => removeOption(i)} hitSlop={8}>
                  <Text style={styles.close}>✕</Text>
                </Pressable>
              ) : null}
            </View>
          ))}

          <Pressable onPress={addOption}>
            <Text style={styles.addOption}>+ Add option</Text>
          </Pressable>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Allow multiple answers</Text>
            <Switch value={multipleChoice} onValueChange={setMultipleChoice} />
          </View>

          <Pressable onPress={submit} disabled={busy} style={styles.submitButton}>
            <Text style={styles.submitButtonText}>{busy ? "Creating…" : "Create poll"}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 18,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  close: {
    fontSize: 16,
    color: colors.textMuted,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.text,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  optionInput: {
    flex: 1,
  },
  addOption: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
    marginTop: 2,
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  switchLabel: {
    fontSize: 14,
    color: colors.text,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  submitButtonText: {
    color: colors.primaryText,
    fontWeight: "700",
    fontSize: 14,
  },
});
