import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import Avatar from "../../components/Avatar";
import { useAuthSession } from "../../hooks/useAuthSession";
import { useAuthStore } from "../../state/authStore";
import { updateProfile } from "../../api/users";
import { uploadFile } from "../../api/upload";
import { apiErrorMessage } from "../../api/client";
import { useThemeColors } from "../../state/themeStore";
import type { ProfileStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<ProfileStackParamList, "Profile">;

export default function ProfileScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, signOut } = useAuthSession();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [statusText, setStatusText] = useState(user?.status_text ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setName(user?.name ?? "");
    setBio(user?.bio ?? "");
    setStatusText(user?.status_text ?? "");
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile({
        name: name.trim(),
        bio: bio.trim(),
        status_text: statusText.trim(),
      });
      useAuthStore.setState({ user: updated });
      setEditing(false);
    } catch (e) {
      setError(apiErrorMessage(e, "Could not save your profile."));
    } finally {
      setSaving(false);
    }
  };

  const changeAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo access needed", "Enable photo access in settings to change your avatar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setUploadingAvatar(true);
    setError(null);
    try {
      const { url } = await uploadFile({
        uri: asset.uri,
        name: asset.fileName || "avatar.jpg",
        mimeType: asset.mimeType || "image/jpeg",
      });
      const updated = await updateProfile({ avatarUrl: url });
      useAuthStore.setState({ user: updated });
    } catch (e) {
      setError(apiErrorMessage(e, "Could not update your avatar."));
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={changeAvatar} disabled={uploadingAvatar} style={styles.avatarWrap}>
        <Avatar name={user?.name ?? "?"} url={user?.avatarUrl} size={88} />
        <View style={styles.avatarEditBadge}>
          {uploadingAvatar ? <ActivityIndicator size="small" color={colors.primaryText} /> : <Ionicons name="camera" size={14} color={colors.primaryText} />}
        </View>
      </Pressable>

      {!editing ? (
        <>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.campusEmail ?? user?.campus_email ?? user?.email}</Text>
          {!!user?.status_text && <Text style={styles.statusText}>{user.status_text}</Text>}
          {!!user?.bio && <Text style={styles.bio}>{user.bio}</Text>}

          <Pressable onPress={startEditing} style={styles.editButton}>
            <Ionicons name="create-outline" size={16} color={colors.primary} />
            <Text style={styles.editButtonText}>Edit profile</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.form}>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" />
          <Text style={styles.label}>Status</Text>
          <TextInput style={styles.input} value={statusText} onChangeText={setStatusText} placeholder="What's on your mind?" />
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="A little about you"
            multiline
          />
          {error && <Text style={styles.errorText}>{error}</Text>}
          <View style={styles.formButtons}>
            <Button title="Cancel" onPress={() => setEditing(false)} disabled={saving} />
            <Button title={saving ? "Saving…" : "Save"} onPress={save} disabled={saving} color={colors.primary} />
          </View>
        </View>
      )}

      <View style={styles.spacer} />

      <Pressable
        onPress={() => navigation.navigate("Settings")}
        style={styles.settingsRow}
      >
        <Ionicons name="settings-outline" size={20} color={colors.text} />
        <Text style={styles.settingsRowText}>Settings</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      {user?.role === "admin" && (
        <Pressable
          onPress={() => navigation.navigate("Admin")}
          style={styles.settingsRow}
        >
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.text} />
          <Text style={styles.settingsRowText}>Admin</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      )}

      <View style={styles.spacer} />
      <Button title="Sign out" color={colors.danger} onPress={signOut} />
    </ScrollView>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    alignItems: "center",
    padding: 24,
    paddingTop: 48,
    gap: 4,
    backgroundColor: colors.background,
  },
  avatarWrap: {
    marginBottom: 8,
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.background,
  },
  name: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginTop: 8,
  },
  email: {
    fontSize: 14,
    color: colors.textMuted,
  },
  statusText: {
    fontSize: 14,
    color: colors.text,
    marginTop: 8,
  },
  bio: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
  },
  editButtonText: {
    color: colors.primary,
    fontWeight: "600",
  },
  form: {
    width: "100%",
    marginTop: 16,
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
  },
  bioInput: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    marginTop: 4,
  },
  formButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  spacer: {
    height: 24,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  settingsRowText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
});
