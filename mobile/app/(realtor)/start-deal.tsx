import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';
import { apiFetch } from '@/lib/api';

/**
 * Attorney deal intake — native twin of the web's /attorney/new.
 *
 * Shaped like the file actually arrives: the attorney's CLIENT is the
 * realtor who referred it, and the realtor brings their buyer or seller.
 * Every section is skippable for direct-engagement files with no agent.
 * Posts to /api/attorney/deals, which runs the same invite pipeline as web.
 */
export default function StartDealScreen() {
  const { colors } = useTheme();
  const toast = useToast();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<'buyer' | 'seller'>('buyer');
  const [phase, setPhase] = useState<'searching' | 'under_contract' | 'closing'>(
    'searching'
  );
  const [address, setAddress] = useState('');
  const [realtorName, setRealtorName] = useState('');
  const [realtorEmail, setRealtorEmail] = useState('');
  const [principalName, setPrincipalName] = useState('');
  const [principalEmail, setPrincipalEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const principal = kind === 'buyer' ? 'Buyer' : 'Seller';

  const submit = async () => {
    if (!name.trim()) {
      toast.show('Give the deal a name — the client or property works well.', {
        variant: 'error',
      });
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; deal_id: string }>(
        '/api/attorney/deals',
        {
          method: 'POST',
          body: {
            name: name.trim(),
            kind,
            phase,
            address: address.trim() || undefined,
            realtor: realtorEmail.trim()
              ? { name: realtorName.trim(), email: realtorEmail.trim() }
              : undefined,
            principal: principalEmail.trim()
              ? { name: principalName.trim(), email: principalEmail.trim() }
              : undefined,
          },
        }
      );
      toast.show('Deal created — invites are on their way.', {
        variant: 'success',
      });
      router.replace(`/(realtor)/clients/${res.deal_id}` as any);
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const Chip = ({
    active,
    label,
    onPress,
  }: {
    active: boolean;
    label: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      style={[
        s.chip,
        {
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active ? colors.primary : 'transparent',
        },
      ]}
    >
      <Text
        style={{
          color: active ? '#fff' : colors.text,
          fontSize: 13,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={[s.c, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={() => router.back()} style={s.back}>
            <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Back</Text>
          </Pressable>

          <Text style={[s.h1, { color: colors.text }]}>Start a deal</Text>
          <Text style={[s.sub, { color: colors.textSecondary }]}>
            Everyone you add gets an email invite and their own view. Realtors
            and clients join free.
          </Text>

          <Text style={[s.label, { color: colors.text }]}>Deal name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Smith closing — 412 Maple Ave"
            placeholderTextColor={colors.textSecondary}
            style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          />

          <Text style={[s.label, { color: colors.text }]}>Which side is this file?</Text>
          <View style={s.row}>
            <Chip active={kind === 'buyer'} label="Buyer side" onPress={() => setKind('buyer')} />
            <Chip active={kind === 'seller'} label="Seller side" onPress={() => setKind('seller')} />
          </View>

          <Text style={[s.label, { color: colors.text }]}>Starting stage</Text>
          <View style={s.row}>
            <Chip active={phase === 'searching'} label="Home search" onPress={() => setPhase('searching')} />
            <Chip active={phase === 'under_contract'} label="Under contract" onPress={() => setPhase('under_contract')} />
            <Chip active={phase === 'closing'} label="Closing" onPress={() => setPhase('closing')} />
          </View>

          <Text style={[s.label, { color: colors.text }]}>
            Property address <Text style={{ color: colors.textSecondary }}>(optional)</Text>
          </Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="412 Maple Avenue, Johns Creek, GA"
            placeholderTextColor={colors.textSecondary}
            style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          />

          {/* The realtor — usually the attorney's actual client */}
          <View style={[s.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>
              The realtor who brought you this file
            </Text>
            <Text style={[s.cardHint, { color: colors.textSecondary }]}>
              Usually your actual client. Full realtor access, free. Skip if no
              agent is involved.
            </Text>
            <TextInput
              value={realtorName}
              onChangeText={setRealtorName}
              placeholder="Realtor's name"
              placeholderTextColor={colors.textSecondary}
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            <TextInput
              value={realtorEmail}
              onChangeText={setRealtorEmail}
              placeholder="realtor@brokerage.com"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />
          </View>

          {/* The realtor's client */}
          <View style={[s.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>The {principal.toLowerCase()}</Text>
            <Text style={[s.cardHint, { color: colors.textSecondary }]}>
              The realtor&apos;s client — follows the deal from their own view.
              Optional.
            </Text>
            <TextInput
              value={principalName}
              onChangeText={setPrincipalName}
              placeholder={`${principal}'s name`}
              placeholderTextColor={colors.textSecondary}
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            <TextInput
              value={principalEmail}
              onChangeText={setPrincipalEmail}
              placeholder={kind === 'buyer' ? 'buyer@example.com' : 'seller@example.com'}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />
          </View>

          <Text style={[s.cardHint, { color: colors.textSecondary, marginTop: 4 }]}>
            Lenders, title agents and the other side&apos;s realtor can be added
            from the deal afterwards.
          </Text>

          <Pressable
            onPress={submit}
            disabled={busy}
            style={[s.cta, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.ctaText}>Create deal & send invites →</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  h1: { fontSize: 26, fontWeight: '800' },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginTop: 8,
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardHint: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  cta: {
    marginTop: 24,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
