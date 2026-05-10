import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  Alert,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

/**
 * Client profile screen — same scope as realtor settings minus the firm
 * branding (clients don't own a firm). Editable name, read-only email,
 * change-password modal, sign out.
 */
export default function ClientProfileScreen() {
  const { user, userProfile, signOut } = useAuth();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [fullName, setFullName] = useState(userProfile?.full_name ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setFullName(userProfile?.full_name ?? '');
  }, [userProfile?.full_name]);

  // Password modal
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const profileDirty = useMemo(
    () => (fullName ?? '').trim() !== (userProfile?.full_name ?? '').trim(),
    [fullName, userProfile?.full_name]
  );

  const saveProfile = async () => {
    if (!user?.id) return;
    const trimmed = fullName.trim();
    if (!trimmed) {
      toast.show('Your realtor needs a name to call you.', {
        variant: 'error',
      });
      return;
    }
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ full_name: trimmed })
        .eq('id', user.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['userProfile', user.id] });
      toast.show('Profile saved.', { variant: 'success' });
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setSavingProfile(false);
    }
  };

  const closePwModal = () => {
    setPwOpen(false);
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
  };

  const submitPasswordChange = async () => {
    if (!user?.email) return;
    if (newPw.length < 8) {
      toast.show('Password must be at least 8 characters.', {
        variant: 'error',
      });
      return;
    }
    if (newPw !== confirmPw) {
      toast.show('Passwords don’t match. Re-enter the new password.', {
        variant: 'error',
      });
      return;
    }
    setPwSaving(true);
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPw,
      });
      if (reauthError) {
        throw new Error('Current password didn’t match.');
      }

      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;

      toast.show('Password updated.', { variant: 'success' });
      closePwModal();
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setPwSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <SectionHeader icon="person-circle-outline" label="Profile" colors={colors} />
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <FieldLabel colors={colors}>Full name</FieldLabel>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <Pressable
            onPress={saveProfile}
            disabled={!profileDirty || savingProfile}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: !profileDirty ? colors.border : colors.primary,
                opacity: savingProfile ? 0.7 : 1,
              },
            ]}
          >
            {savingProfile ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Save profile</Text>
            )}
          </Pressable>
        </View>

        <SectionHeader icon="lock-closed-outline" label="Account" colors={colors} />
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <FieldLabel colors={colors}>Email</FieldLabel>
          <View style={[styles.readonly, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={[styles.readonlyText, { color: colors.text }]}>{user?.email ?? '—'}</Text>
          </View>
          <Text style={[styles.helper, { color: colors.textSecondary }]}>
            To change your email, contact your realtor.
          </Text>

          <Pressable
            onPress={() => setPwOpen(true)}
            style={[styles.secondaryBtn, { borderColor: colors.primary }]}
          >
            <Ionicons name="key-outline" size={16} color={colors.primary} />
            <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Change password</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={handleSignOut}
          style={[styles.signOutBtn, { borderColor: colors.error }]}
        >
          <Ionicons name="log-out-outline" size={16} color={colors.error} />
          <Text style={[styles.signOutText, { color: colors.error }]}>Sign Out</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={pwOpen} animationType="slide" transparent onRequestClose={closePwModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Change password</Text>
              <Pressable onPress={closePwModal} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <FieldLabel colors={colors}>Current password</FieldLabel>
            <TextInput
              value={currentPw}
              onChangeText={setCurrentPw}
              secureTextEntry
              autoCapitalize="none"
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />

            <FieldLabel colors={colors}>New password</FieldLabel>
            <TextInput
              value={newPw}
              onChangeText={setNewPw}
              secureTextEntry
              autoCapitalize="none"
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />

            <FieldLabel colors={colors}>Confirm new password</FieldLabel>
            <TextInput
              value={confirmPw}
              onChangeText={setConfirmPw}
              secureTextEntry
              autoCapitalize="none"
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />

            <Pressable
              onPress={submitPasswordChange}
              disabled={pwSaving}
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: pwSaving ? 0.7 : 1 }]}
            >
              {pwSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Update password</Text>
              )}
            </Pressable>
            <Pressable onPress={closePwModal} style={styles.cancelBtn}>
              <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function SectionHeader({
  icon,
  label,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} />
      <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

function FieldLabel({
  children,
  colors,
}: {
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return <Text style={[styles.fieldLabel, { color: colors.text }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 20, paddingBottom: 60 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionHeaderText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  readonly: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  readonlyText: { fontSize: 15 },
  helper: { fontSize: 11, marginTop: 6 },
  primaryBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    marginTop: 14,
  },
  secondaryBtnText: { fontWeight: '600', fontSize: 14 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    marginTop: 28,
  },
  signOutText: { fontSize: 14, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    padding: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelBtnText: { fontSize: 14 },
});
