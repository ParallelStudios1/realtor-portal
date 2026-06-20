import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

/**
 * Realtor → invite a buyer or seller. Hits /api/clients/invite which
 * sends the magic-link email AND creates the users + client_searches rows
 * so messaging, houses, etc. have something to attach to.
 */
export default function InviteClientScreen() {
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState<'buyer' | 'seller'>('buyer');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!fullName.trim() || !email.trim()) {
      toast.show('Name and email are required.', { variant: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const apiBase =
        (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
        'https://realtorportal.parallelstudios.co';
      const r = await fetch(`${apiBase}/api/clients/invite`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          role_in_deal: kind,
        }),
      });
      const raw = await r.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {}
      if (!r.ok || !json?.ok) {
        throw new Error(json?.error || `Failed (HTTP ${r.status}).`);
      }
      // Refresh the realtor's lists
      queryClient.invalidateQueries({ queryKey: ['clientSearches'] });
      queryClient.invalidateQueries({ queryKey: ['realtor-threads'] });
      queryClient.invalidateQueries({ queryKey: ['realtor-home-stats'] });
      toast.show(`Invite sent to ${fullName}.`, { variant: 'success' });
      router.back();
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={s.backRow}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
            <Text style={[s.back, { color: colors.text }]}>Back</Text>
          </Pressable>

          <Text style={[s.title, { color: colors.text }]}>Invite a client</Text>
          <Text style={[s.subtitle, { color: colors.textSecondary }]}>
            We'll email them a link to set their password.
          </Text>

          {/* Buyer / Seller toggle */}
          <View style={s.kindRow}>
            <KindButton
              label="Buyer"
              active={kind === 'buyer'}
              colors={colors}
              onPress={() => setKind('buyer')}
            />
            <KindButton
              label="Seller"
              active={kind === 'seller'}
              colors={colors}
              onPress={() => setKind('seller')}
            />
          </View>

          <Field
            label="Full name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Eric Logan"
            colors={colors}
          />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="eric@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            colors={colors}
          />

          <Pressable
            onPress={submit}
            disabled={submitting}
            style={[
              s.submit,
              { backgroundColor: colors.primary, opacity: submitting ? 0.5 : 1 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.submitText}>Send invite</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function KindButton({
  label,
  active,
  colors,
  onPress,
}: {
  label: string;
  active: boolean;
  colors: any;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.kindBtn,
        {
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active ? colors.primary + '14' : 'transparent',
        },
      ]}
    >
      <Text
        style={{
          color: active ? colors.primary : colors.textSecondary,
          fontWeight: '700',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  colors,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  colors: any;
}) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={[s.fieldLabel, { color: colors.text }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        style={[
          s.input,
          {
            color: colors.text,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 24, paddingBottom: 60 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  back: { fontSize: 14 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 4, marginBottom: 16 },
  kindRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  kindBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  submit: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
