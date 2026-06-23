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
  Linking,
} from 'react-native';
import { Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';
import { MANAGE_PLAN_URL, trialDaysLeft } from '@/components/TrialBanner';
import { apiFetch } from '@/lib/api';

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Realtor settings - profile (full_name), account (email read-only + change
 * password modal), firm branding (firm_admin only), and sign out.
 *
 * Saves go straight to Supabase from the device since RLS on `users` and
 * `firms` already restricts writes to the right rows.
 */
export default function RealtorSettingsScreen() {
  const { user, userProfile, signOut } = useAuth();
  const { firm, colors } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();

  const isFirmAdmin = userProfile?.role === 'firm_admin' || userProfile?.role === 'super_admin';

  // Profile state
  const [fullName, setFullName] = useState(userProfile?.full_name ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setFullName(userProfile?.full_name ?? '');
  }, [userProfile?.full_name]);

  // Firm state
  const [firmName, setFirmName] = useState(firm?.name ?? '');
  const [brandColor, setBrandColor] = useState(firm?.brand_color ?? firm?.primary_color ?? '#0F172A');
  const [accentColor, setAccentColor] = useState(firm?.accent_color ?? firm?.secondary_color ?? '#2563EB');
  const [tagline, setTagline] = useState(firm?.tagline ?? '');
  const [contactPhone, setContactPhone] = useState(firm?.contact_phone ?? '');
  const [contactEmail, setContactEmail] = useState(firm?.contact_email ?? '');
  const [savingFirm, setSavingFirm] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(firm?.logo_url ?? null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    setLogoUrl(firm?.logo_url ?? null);
  }, [firm?.logo_url]);

  // Upload a firm logo to the public `firm-assets` bucket (same approach as
  // house photos) and save it on the firm immediately.
  const pickAndUploadLogo = async () => {
    if (!firm?.id) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show('Allow photo access to upload a logo.', { variant: 'error' });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      exif: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setUploadingLogo(true);
    try {
      const ext = (asset.fileName?.split('.').pop() || asset.uri.split('.').pop() || 'png')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') || 'png';
      const path = `${firm.id}/logo-${Date.now()}.${ext}`;
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const contentType =
        asset.mimeType || (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
      const { error: upErr } = await supabase.storage
        .from('firm-assets')
        .upload(path, bytes, { contentType, upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('firm-assets').getPublicUrl(path);
      const url = pub?.publicUrl;
      if (!url) throw new Error('Could not get the logo URL.');
      const { error: saveErr } = await supabase
        .from('firms')
        .update({ logo_url: url })
        .eq('id', firm.id);
      if (saveErr) throw saveErr;
      setLogoUrl(url);
      await queryClient.invalidateQueries({ queryKey: ['firm', firm.id] });
      toast.show('Logo updated.', { variant: 'success' });
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setUploadingLogo(false);
    }
  };

  useEffect(() => {
    setFirmName(firm?.name ?? '');
    setBrandColor(firm?.brand_color ?? firm?.primary_color ?? '#0F172A');
    setAccentColor(firm?.accent_color ?? firm?.secondary_color ?? '#2563EB');
    setTagline(firm?.tagline ?? '');
    setContactPhone(firm?.contact_phone ?? '');
    setContactEmail(firm?.contact_email ?? '');
  }, [firm?.id]);

  // Password modal state
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const profileDirty = useMemo(
    () => (fullName ?? '').trim() !== (userProfile?.full_name ?? '').trim(),
    [fullName, userProfile?.full_name]
  );

  const firmDirty = useMemo(
    () =>
      (firmName ?? '').trim() !== (firm?.name ?? '').trim() ||
      (brandColor ?? '') !== (firm?.brand_color ?? firm?.primary_color ?? '#0F172A') ||
      (accentColor ?? '') !== (firm?.accent_color ?? firm?.secondary_color ?? '#2563EB') ||
      (tagline ?? '') !== (firm?.tagline ?? '') ||
      (contactPhone ?? '') !== (firm?.contact_phone ?? '') ||
      (contactEmail ?? '') !== (firm?.contact_email ?? ''),
    [firmName, brandColor, accentColor, tagline, contactPhone, contactEmail, firm]
  );

  const saveProfile = async () => {
    if (!user?.id) return;
    const trimmed = fullName.trim();
    if (!trimmed) {
      toast.show('Give yourself a name your clients will see.', {
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

  const saveFirm = async () => {
    if (!firm?.id) return;
    if (!firmName.trim()) {
      toast.show('Your clients see this firm name in the app.', {
        variant: 'error',
      });
      return;
    }
    if (brandColor && !HEX_RE.test(brandColor.trim())) {
      toast.show('Brand color must be a hex value like #1F6FEB.', {
        variant: 'error',
      });
      return;
    }
    if (accentColor && !HEX_RE.test(accentColor.trim())) {
      toast.show('Accent color must be a hex value like #1F6FEB.', {
        variant: 'error',
      });
      return;
    }
    setSavingFirm(true);
    try {
      const { error } = await supabase
        .from('firms')
        .update({
          name: firmName.trim(),
          brand_color: brandColor.trim(),
          accent_color: accentColor.trim(),
          tagline: tagline.trim() || null,
          contact_phone: contactPhone.trim() || null,
          contact_email: contactEmail.trim() || null,
          // Saving branding from the app counts as completing setup, so the
          // "finish setting up your firm" prompt on Home goes away.
          onboarding_completed: true,
        })
        .eq('id', firm.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['firm', firm.id] });
      toast.show('Firm settings saved.', { variant: 'success' });
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setSavingFirm(false);
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
      // Re-verify current password before rotating. Supabase JS doesn't expose
      // a "verify current password" call, so we sign in again with the user's
      // email + current password - if it succeeds the session refreshes, then
      // we update.
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

  const [deleting, setDeleting] = useState(false);
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your account and your personal data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await apiFetch('/api/account/delete', {
                method: 'POST',
                body: { confirm: true },
              });
              toast.show('Your account has been deleted.', { variant: 'success' });
              await signOut();
            } catch (e: any) {
              toast.show(humanError(e), { variant: 'error' });
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Profile section */}
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

        {/* Account section */}
        <SectionHeader icon="lock-closed-outline" label="Account" colors={colors} />
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <FieldLabel colors={colors}>Email</FieldLabel>
          <View style={[styles.readonly, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={[styles.readonlyText, { color: colors.text }]}>{user?.email ?? '-'}</Text>
          </View>
          <Text style={[styles.helper, { color: colors.textSecondary }]}>
            To change your email, contact support.
          </Text>

          <Pressable
            onPress={() => setPwOpen(true)}
            style={[styles.secondaryBtn, { borderColor: colors.primary }]}
          >
            <Ionicons name="key-outline" size={16} color={colors.primary} />
            <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Change password</Text>
          </Pressable>
        </View>

        {/* Plan & billing. Payments are NOT taken in the app (Apple) - this
            opens the billing page on the web to manage the plan. */}
        <SectionHeader icon="card-outline" label="Plan & billing" colors={colors} />
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {(() => {
            const status = (firm as any)?.status as string | undefined;
            const hasSub = Boolean((firm as any)?.stripe_subscription_id);
            const days = trialDaysLeft((firm as any)?.trial_ends_at);
            let line = 'Manage your plan online.';
            if (status === 'active' || hasSub) line = 'Your plan is active.';
            else if (status === 'trial' && days !== null)
              line =
                days <= 0
                  ? 'Your free trial has ended.'
                  : `${days} day${days === 1 ? '' : 's'} left in your free trial.`;
            return (
              <Text style={[styles.readonlyText, { color: colors.text, marginBottom: 4 }]}>
                {line}
              </Text>
            );
          })()}
          <Text style={[styles.helper, { color: colors.textSecondary }]}>
            Plans and payment are managed on the web. This opens your billing page.
          </Text>
          <Pressable
            onPress={() => Linking.openURL(MANAGE_PLAN_URL)}
            style={[styles.secondaryBtn, { borderColor: colors.primary }]}
          >
            <Ionicons name="open-outline" size={16} color={colors.primary} />
            <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
              Manage plan online
            </Text>
          </Pressable>
        </View>

        {/* Firm section - only firm admins can edit */}
        {isFirmAdmin && firm && (
          <>
            <SectionHeader icon="business-outline" label="Firm branding" colors={colors} />
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <FieldLabel colors={colors}>Logo</FieldLabel>
              <Text style={[styles.helper, { color: colors.textSecondary, marginTop: 0, marginBottom: 8 }]}>
                Shown to your clients across the portal and app.
              </Text>
              <View style={styles.logoRow}>
                <View
                  style={[
                    styles.logoBox,
                    { borderColor: colors.border, backgroundColor: colors.background },
                  ]}
                >
                  {logoUrl ? (
                    <Image source={{ uri: logoUrl }} style={styles.logoImg} resizeMode="contain" />
                  ) : (
                    <Ionicons name="image-outline" size={26} color={colors.textSecondary} />
                  )}
                </View>
                <Pressable
                  onPress={pickAndUploadLogo}
                  disabled={uploadingLogo}
                  style={[styles.secondaryBtn, { borderColor: colors.primary, flex: 1, marginTop: 0 }]}
                >
                  {uploadingLogo ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                      <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
                        {logoUrl ? 'Change logo' : 'Upload logo'}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>

              <FieldLabel colors={colors}>Firm name</FieldLabel>
              <TextInput
                value={firmName}
                onChangeText={setFirmName}
                placeholder="Your firm"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              />

              <FieldLabel colors={colors}>Tagline (optional)</FieldLabel>
              <TextInput
                value={tagline}
                onChangeText={setTagline}
                placeholder="e.g. Boston's premier waterfront brokerage"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              />

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <FieldLabel colors={colors}>Brand color</FieldLabel>
                  <View style={styles.colorRow}>
                    <View style={[styles.swatch, { backgroundColor: HEX_RE.test(brandColor) ? brandColor : colors.border, borderColor: colors.border }]} />
                    <TextInput
                      value={brandColor}
                      onChangeText={setBrandColor}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="#0F172A"
                      placeholderTextColor={colors.textSecondary}
                      style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    />
                  </View>
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <FieldLabel colors={colors}>Accent color</FieldLabel>
                  <View style={styles.colorRow}>
                    <View style={[styles.swatch, { backgroundColor: HEX_RE.test(accentColor) ? accentColor : colors.border, borderColor: colors.border }]} />
                    <TextInput
                      value={accentColor}
                      onChangeText={setAccentColor}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="#2563EB"
                      placeholderTextColor={colors.textSecondary}
                      style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    />
                  </View>
                </View>
              </View>

              <FieldLabel colors={colors}>Contact phone</FieldLabel>
              <TextInput
                value={contactPhone}
                onChangeText={setContactPhone}
                placeholder="(555) 123-4567"
                placeholderTextColor={colors.textSecondary}
                keyboardType="phone-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              />

              <FieldLabel colors={colors}>Contact email</FieldLabel>
              <TextInput
                value={contactEmail}
                onChangeText={setContactEmail}
                placeholder="hello@yourfirm.com"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                keyboardType="email-address"
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              />

              <Pressable
                onPress={saveFirm}
                disabled={!firmDirty || savingFirm}
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: !firmDirty ? colors.border : colors.primary,
                    opacity: savingFirm ? 0.7 : 1,
                  },
                ]}
              >
                {savingFirm ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Save firm</Text>
                )}
              </Pressable>
            </View>
          </>
        )}

        {/* Sign out */}
        <Pressable
          onPress={handleSignOut}
          style={[styles.signOutBtn, { borderColor: colors.error }]}
        >
          <Ionicons name="log-out-outline" size={16} color={colors.error} />
          <Text style={[styles.signOutText, { color: colors.error }]}>Sign Out</Text>
        </Pressable>

        {/* Apple/Google require in-app account deletion for account-based apps. */}
        <Pressable
          onPress={handleDeleteAccount}
          disabled={deleting}
          style={{ marginTop: 14, alignItems: 'center', paddingVertical: 8 }}
        >
          {deleting ? (
            <ActivityIndicator color={colors.error} />
          ) : (
            <Text style={{ color: colors.error, fontSize: 13, fontWeight: '600' }}>
              Delete my account
            </Text>
          )}
        </Pressable>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 11,
            textAlign: 'center',
            marginTop: 4,
            paddingHorizontal: 24,
          }}
        >
          Permanently deletes your account and personal data.
        </Text>

        <Text style={[styles.version, { color: colors.textSecondary }]}>Realtor Portal v0.1</Text>
      </ScrollView>

      {/* Change password modal */}
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
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%' },
  row: { flexDirection: 'row' },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 28, height: 28, borderRadius: 6, borderWidth: 1 },
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
  version: { fontSize: 11, marginTop: 24, textAlign: 'center' },
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
