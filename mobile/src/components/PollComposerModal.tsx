import { useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

import { useThemeColors } from "../state/themeStore";
import { uploadFile } from "../api/upload";

export interface CreatePollParams {
  question: string;
  options: string[];
  multipleChoice: boolean;
  quizMode: boolean;
  correctOptionIndex?: number;
  optionImages?: (string | null)[];
}

export default function PollComposerModal({
  visible,
  onCreate,
  onClose,
}: {
  visible: boolean;
  onCreate: (params: CreatePollParams) => Promise<void>;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [correctOptionIndex, setCorrectOptionIndex] = useState(0);
  const [optionImages, setOptionImages] = useState<(string | null)[]>([null, null]);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateOption = (i: number, value: string) => {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  };
  const addOption = () => {
    setOptions((prev) => [...prev, ""]);
    setOptionImages((prev) => [...prev, null]);
  };
  const removeOption = (i: number) => {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
    setOptionImages((prev) => prev.filter((_, idx) => idx !== i));
    setCorrectOptionIndex((c) => (c >= i && c > 0 ? c - 1 : c));
  };

  const pickImage = async (i: number) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo access needed", "Enable photo access in settings to attach an answer image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploadingIndex(i);
    try {
      const { url } = await uploadFile({ uri: asset.uri, name: asset.fileName || "answer.jpg", mimeType: asset.mimeType || "image/jpeg" });
      setOptionImages((prev) => prev.map((u, idx) => (idx === i ? url : u)));
    } catch {
      setError("Couldn't upload that image — try again.");
    } finally {
      setUploadingIndex(null);
    }
  };

  const reset = () => {
    setQuestion("");
    setOptions(["", ""]);
    setMultipleChoice(false);
    setQuizMode(false);
    setCorrectOptionIndex(0);
    setOptionImages([null, null]);
    setError(null);
  };

  const submit = async () => {
    const cleanOptions = options.map((o) => o.trim());
    const nonEmptyCount = cleanOptions.filter(Boolean).length;
    if (!question.trim() || nonEmptyCount < 2) {
      setError(`Enter a question and at least 2 ${quizMode ? "answers" : "options"}.`);
      return;
    }
    if (quizMode && !cleanOptions[correctOptionIndex]) {
      setError("Pick the correct answer.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        question: question.trim(),
        options: cleanOptions.filter(Boolean),
        multipleChoice,
        quizMode,
        correctOptionIndex: quizMode ? correctOptionIndex : undefined,
        optionImages: quizMode ? optionImages.filter((_, i) => cleanOptions[i]) : undefined,
      });
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not create that ${quizMode ? "quiz" : "poll"}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <Text style={styles.title}>{quizMode ? "Create quiz" : "Create poll"}</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={styles.quizToggleRow}
              onPress={() => { const v = !quizMode; setQuizMode(v); if (v) setMultipleChoice(false); }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.quizToggleLabel}>🎯 Make this a quiz</Text>
                <Text style={styles.quizToggleSub}>One correct answer, revealed after voting</Text>
              </View>
              <Switch value={quizMode} onValueChange={(v) => { setQuizMode(v); if (v) setMultipleChoice(false); }} />
            </Pressable>

            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder={quizMode ? "Ask a question with one right answer" : "Ask a question"}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            {options.map((opt, i) => (
              <View key={i} style={styles.optionRow}>
                {quizMode ? (
                  <Pressable onPress={() => setCorrectOptionIndex(i)} hitSlop={8} style={styles.radioOuter}>
                    {correctOptionIndex === i ? <View style={styles.radioInner} /> : null}
                  </Pressable>
                ) : null}
                {quizMode ? (
                  <Pressable onPress={() => pickImage(i)} style={styles.imagePick}>
                    {optionImages[i] ? (
                      <Image source={{ uri: optionImages[i]! }} style={styles.imagePickThumb} />
                    ) : uploadingIndex === i ? (
                      <Text style={styles.imagePickIcon}>…</Text>
                    ) : (
                      <Ionicons name="image-outline" size={16} color={colors.textMuted} />
                    )}
                  </Pressable>
                ) : null}
                <TextInput
                  value={opt}
                  onChangeText={(v) => updateOption(i, v)}
                  placeholder={`${quizMode ? "Answer" : "Option"} ${i + 1}`}
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
              <Text style={styles.addOption}>+ Add {quizMode ? "answer" : "option"}</Text>
            </Pressable>

            {!quizMode ? (
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Allow multiple answers</Text>
                <Switch value={multipleChoice} onValueChange={setMultipleChoice} />
              </View>
            ) : null}

            <Pressable onPress={submit} disabled={busy} style={styles.submitButton}>
              <Text style={styles.submitButtonText}>{busy ? "Creating…" : quizMode ? "Create quiz" : "Create poll"}</Text>
            </Pressable>
          </ScrollView>
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
    maxHeight: "85%",
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
  quizToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  quizToggleLabel: { fontSize: 13.5, fontWeight: "600", color: colors.text },
  quizToggleSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
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
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  imagePick: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  imagePickThumb: { width: "100%", height: "100%" },
  imagePickIcon: { fontSize: 10, color: colors.textMuted },
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
