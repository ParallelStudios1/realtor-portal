import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useTheme } from '@/lib/theme';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

type Role = 'realtor' | 'buyer' | 'seller' | null;

/**
 * Role-aware signup. The user picks WHO THEY ARE first; the form below adapts.
 *
 *  Realtor → ask firm name → call create_firm_and_admin RPC.
 *  Buyer / Seller → ask realtor's email → call create_client_user RPC.
 *
 * In both cases we create the public.users row immediately, so the user is
 * never stuck on the OrphanAccountScreen.
 */
export default function SignupScreen() {
  const router = useRouter();
  const { signUp, isLoading } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();

  const [role, setRole] = useState<Role>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [firmName, setFirmName] = useState('');
  const [realtorEmail, setRealtorEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const accent = colors.primary;

  const validate = () => {
    if (!fullName.trim()) return 'Full name is required.';
    if (!email.trim()) return 'Email is required.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirm) return 'Passwords do not match.';
    if (role === 'realtor' && !firmName.trim())
      return 'Firm or brokerage name is required.';
    if ((role === 'buyer' || role === 'seller') && !realtorEmail.trim())
      return "Your realtor's email is required.";
    return null;
  };

  const handleSubmit = async () => {
    const v = validate();
    if (v) {
      toast.show(v, { variant: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const apiBase =
        (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
        'https://realtorportal.parallelstudios.co';

      // Step 1 — server admin-creates the auth user (email pre-confirmed),
      // creates firm OR attaches to realtor's firm, creates starter search.
      // This bypasses Supabase's "Confirm email" requirement which otherwise
      // blocks signInWithPassword and the create_firm_and_admin RPC.
      const r = await fetch(`${apiBase}/api/auth/signup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          role,
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          firm_name: role === 'realtor' ? firmName.trim() : undefined,
          realtor_email:
            role === 'buyer' || role === 'seller'
              ? realtorEmail.trim()
              : undefined,
        }),
      });
      const raw = await r.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {}
      if (!r.ok || !json?.ok) {
        throw new Error(json?.error || `Signup failed (HTTP ${r.status}).`);
      }

      // Step 2 — sign in. Email is pre-confirmed so this works on first try.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;

      // Step 3 — done. The auth listener inside AuthProvider sees the
      // SIGNED_IN event, swaps the root navigator to (realtor) or (client),
      // and that re-render is the navigation. We don't need router.replace
      // here — calling replace('/') against the (auth) Stack throws
      // "no route named 'index'" because the route group changes underneath
      // us. Just let the listener handle it.
    } catch (err: any) {
      toast.show(humanError(err), { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.title, { color: colors.text }]}>
            Welcome to Realtor Portal
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            First, who are you?
          </Text>

          {/* Role picker */}
          <View style={styles.roleRow}>
            <RoleCard
              icon="briefcase-outline"
              label="Realtor"
              hint="I help others buy or sell"
              active={role === 'realtor'}
              accent={accent}
              colors={colors}
              onPress={() => setRole('realtor')}
            />
            <RoleCard
              icon="home-outline"
              label="Buyer"
              hint="I'm looking for a home"
              active={role === 'buyer'}
              accent={accent}
              colors={colors}
              onPress={() => setRole('buyer')}
            />
            <RoleCard
              icon="cash-outline"
              label="Seller"
              hint="I'm selling a home"
              active={role === 'seller'}
              accent={accent}
              colors={colors}
              onPress={() => setRole('seller')}
            />
          </View>

          {role && (
            <>
              <Field
                label="Full name"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Turner Logan"
                colors={colors}
              />
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                colors={colors}
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                secureTextEntry
                colors={colors}
              />
              <Field
                label="Confirm password"
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Type it again"
                secureTextEntry
                colors={colors}
              />

              {role === 'realtor' && (
                <Field
                  label="Firm or brokerage name"
                  value={firmName}
                  onChangeText={setFirmName}
                  placeholder="Logan Realty Group"
                  colors={colors}
                />
              )}

              {(role === 'buyer' || role === 'seller') && (
                <Field
                  label="Your realtor's email"
                  value={realtorEmail}
                  onChangeText={setRealtorEmail}
                  placeholder="agent@brokerage.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  colors={colors}
                  hint="We'll connect you to their portal automatically."
                />
              )}

              <PrimaryButton
                label={submitting || isLoading ? 'Creating…' : 'Create account'}
                onPress={handleSubmit}
                loading={submitting || isLoading}
                disabled={submitting || isLoading}
                style={{ marginTop: 12 }}
              />
            </>
          )}

          <View style={styles.signin}>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
              Already have an account?{' '}
            </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text
                  style={{ color: accent, fontWeight: '600', fontSize: 14 }}
                >
                  Sign in
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RoleCard({
  icon,
  label,
  hint,
  active,
  accent,
  colors,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  active: boolean;
  accent: string;
  colors: any;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.roleCard,
        {
          borderColor: active ? accent : colors.border,
          backgroundColor: active ? accent + '12' : colors.surface,
        },
      ]}
    >
      <Ionicons name={icon} size={24} color={active ? accent : colors.text} />
      <Text
        style={[
          styles.roleLabel,
          { color: active ? accent : colors.text, fontWeight: '700' },
        ]}
      >
        {label}
      </Text>
      <Text style={[styles.roleHint, { color: colors.textSecondary }]}>
        {hint}
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
  secureTextEntry,
  autoCapitalize,
  colors,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address';
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  colors: any;
  hint?: string;
}) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType={keyboardType ?? 'default'}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        style={[
          styles.input,
          {
            color: colors.text,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      />
      {hint && (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 24, paddingBottom: 60 },
  title: { fontSize: 26, fontWeight: '800', marginTop: 8 },
  subtitle: { fontSize: 15, marginTop: 4, marginBottom: 18 },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  roleLabel: { fontSize: 14, marginTop: 4 },
  roleHint: { fontSize: 11, textAlign: 'center' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  hint: { fontSize: 11, marginTop: 4 },
  signin: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 28,
  },
});
