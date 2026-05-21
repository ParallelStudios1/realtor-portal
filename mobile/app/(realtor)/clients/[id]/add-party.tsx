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
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

/**
 * Mobile "Add party to deal" screen. Mirrors the web AddPartyModal:
 *
 *   - Phone-first (SMS is the primary channel — see /lib/notify on the web)
 *   - Email optional (only required if they already have a Realtor Portal
 *     account that we want to link this party to)
 *   - Role picker covering every PartyRole the web supports
 *   - Visibility checkboxes
 *
 * Posts to /api/participants/add — same backend the web modal hits, so
 * the SMS invite, magic-link signup, activity log, and notify-fanout are
 * the same.
 */

type PartyRole =
  | 'realtor'
  | 'co_realtor'
  | 'buyer'
  | 'seller'
  | 'attorney'
  | 'inspector'
  | 'lender'
  | 'mortgage_broker'
  | 'other';

const PARTY_ROLES: { id: PartyRole; label: string; hint: string }[] = [
  { id: 'realtor', label: 'Realtor', hint: 'Lead agent on this deal.' },
  {
    id: 'co_realtor',
    label: 'Co-realtor',
    hint: 'Opposing-side or co-listing realtor.',
  },
  { id: 'buyer', label: 'Buyer', hint: 'Buyer or buying party.' },
  { id: 'seller', label: 'Seller', hint: 'Seller or selling party.' },
  { id: 'attorney', label: 'Attorney', hint: 'Closing or transactional attorney.' },
  { id: 'inspector', label: 'Inspector', hint: 'Home / pest / septic inspector.' },
  { id: 'lender', label: 'Lender', hint: 'Loan officer at the bank.' },
  {
    id: 'mortgage_broker',
    label: 'Mortgage broker',
    hint: 'Independent broker shopping the loan.',
  },
  { id: 'other', label: 'Other', hint: 'Someone else involved in the deal.' },
];

export default function AddPartyScreen() {
  const { id: searchId } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [role, setRole] = useState<PartyRole>('co_realtor');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [docs, setDocs] = useState(true);
  const [fin, setFin] = useState(false);
  const [msgs, setMsgs] = useState(false);
  const [dates, setDates] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    !!searchId && (name.trim() || phone.trim() || email.trim()) && !submitting;

  const submit = async () => {
    if (!searchId) return;
    if (!name.trim() && !phone.trim() && !email.trim()) {
      toast.show('Give me a name, phone, or email.', { variant: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const apiBase =
        (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
        'https://realtor-portal-ten.vercel.app';
      const r = await fetch(`${apiBase}/api/participants/add`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          search_id: searchId,
          role,
          name: name.trim() || undefined,
          email: email.trim().toLowerCase() || undefined,
          phone: phone.trim() || undefined,
          can_view_documents: docs,
          can_view_financials: fin,
          can_view_messages: msgs,
          can_view_dates: dates,
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
      // Refresh the participants list on the deal screen.
      queryClient.invalidateQueries({ queryKey: ['deal-participants', searchId] });
      queryClient.invalidateQueries({ queryKey: ['search', searchId] });
      const sentBits: string[] = [];
      if (json.notify?.sms?.ok) sentBits.push('Text');
      if (json.notify?.email?.ok) sentBits.push('Email');
      const sent =
        sentBits.length > 0 ? ` — ${sentBits.join(' + ')} sent` : '';
      toast.show(`Added ${name || email || phone}${sent}.`, {
        variant: 'success',
      });
      router.back();
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Add party
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            ROLE
          </Text>
          <View style={styles.roleGrid}>
            {PARTY_ROLES.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => setRole(r.id)}
                style={[
                  styles.rolePill,
                  {
                    backgroundColor:
                      role === r.id ? colors.primary : colors.surface,
                    borderColor:
                      role === r.id ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: role === r.id ? '#fff' : colors.text,
                    fontWeight: '600',
                    fontSize: 13,
                  }}
                >
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {PARTY_ROLES.find((r) => r.id === role)?.hint}
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 22 }]}>
            NAME
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          />

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>
            PHONE (TEXT INVITE)
          </Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="(555) 123-4567"
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
            autoComplete="tel"
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            We&apos;ll text them the deal link. US numbers in any format are fine.
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>
            EMAIL (OPTIONAL)
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="jane@example.com"
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            If they have a Realtor Portal account we&apos;ll link this party to it.
            For opposing realtors we&apos;ll generate a one-tap signup link.
          </Text>

          <View style={[styles.fieldset, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.fieldsetLabel, { color: colors.textSecondary }]}>
              WHAT THIS PARTY CAN SEE
            </Text>
            <ToggleRow label="Important dates" value={dates} onValueChange={setDates} colors={colors} />
            <ToggleRow label="Documents" value={docs} onValueChange={setDocs} colors={colors} />
            <ToggleRow label="Financials" value={fin} onValueChange={setFin} colors={colors} />
            <ToggleRow label="Messages" value={msgs} onValueChange={setMsgs} colors={colors} />
          </View>

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={[
              styles.submit,
              {
                backgroundColor: canSubmit ? colors.primary : colors.border,
              },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitLabel}>Add party</Text>
            )}
          </Pressable>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  colors,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  colors: any;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  container: { padding: 16 },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  hint: { fontSize: 12, marginTop: 6 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rolePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  fieldset: {
    marginTop: 22,
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
  },
  fieldsetLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  toggleLabel: { fontSize: 15 },
  submit: {
    marginTop: 22,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitLabel: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
