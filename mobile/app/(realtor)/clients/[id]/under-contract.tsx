import React, { useMemo, useState } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useHouses } from '@/lib/queries';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

/**
 * Mobile "Mark under contract + who's selling" screen — parity with the web
 * goUnderContractAction convergence flow.
 *
 * The realtor:
 *   1. Picks which house the buyer is going under contract on.
 *   2. Optionally captures the SELLING side — the seller and the listing agent
 *      (name / email / firm).
 *
 * On submit we POST to /api/participants/add with `house_id` + `seller_capture`.
 * The backend marks the chosen house under contract, flips the deal phase,
 * stamps the seller_* fields, adds the listing agent as a HOUSE-SCOPED seller
 * participant (so they only ever see that one property), and — when the listing
 * agent is an in-app user running this address as a seller deal — links the two
 * sides via houses.listing_search_id. Same single backend the web uses.
 *
 * Styling mirrors the existing mobile screens (add-house / add-party): themed
 * colors, flat cards, no gradients.
 */
export default function UnderContractScreen() {
  const { id: searchId } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: houses, isLoading: housesLoading } = useHouses(searchId);

  const houseList = useMemo(() => (houses ?? []) as any[], [houses]);

  const [houseId, setHouseId] = useState<string | null>(null);
  const [sellerName, setSellerName] = useState('');
  const [sellerEmail, setSellerEmail] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [agentFirm, setAgentFirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Default to the first house once they load.
  const effectiveHouseId = houseId ?? houseList[0]?.id ?? null;

  const apiBase = (
    (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
    'https://realtorportal.parallelstudios.co'
  ).replace(/\/$/, '');

  const canSubmit = !!searchId && !!effectiveHouseId && !submitting;

  const submit = async () => {
    if (!searchId || !effectiveHouseId) {
      toast.show('Pick the house going under contract first.', {
        variant: 'error',
      });
      return;
    }
    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      // We always send the listing agent as the party to add (house-scoped,
      // seller-side). When no agent contact is given we still mark the house
      // under contract — the participant insert just won't notify anyone.
      const hasAgent = !!(agentName.trim() || agentEmail.trim());

      const r = await fetch(`${apiBase}/api/participants/add`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          search_id: searchId,
          role: 'co_realtor',
          represents: 'seller',
          name: hasAgent ? agentName.trim() || undefined : undefined,
          email: hasAgent
            ? agentEmail.trim().toLowerCase() || undefined
            : undefined,
          house_id: effectiveHouseId,
          // Seller party defaults to the conservative visibility used on the
          // web house-scoped party (docs + dates, not financials/messages).
          can_view_documents: true,
          can_view_financials: false,
          can_view_messages: false,
          can_view_dates: true,
          seller_capture: {
            mark_under_contract: true,
            seller_name: sellerName.trim() || null,
            seller_email: sellerEmail.trim() || null,
            seller_realtor_name: agentName.trim() || null,
            seller_realtor_email: agentEmail.trim().toLowerCase() || null,
            seller_realtor_firm: agentFirm.trim() || null,
          },
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

      // Refresh everything the deal screen reads.
      queryClient.invalidateQueries({ queryKey: ['search', searchId] });
      queryClient.invalidateQueries({ queryKey: ['houses', searchId] });
      queryClient.invalidateQueries({
        queryKey: ['deal-participants', searchId],
      });
      queryClient.invalidateQueries({ queryKey: ['activities', searchId] });
      queryClient.invalidateQueries({ queryKey: ['clientSearches'] });

      toast.show('Marked under contract.', { variant: 'success' });
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
          Under contract
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            Pick the house your buyer is going under contract on, then tell us
            who&apos;s selling. The listing agent is added to this one property
            only — they never see your buyer&apos;s other houses.
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            HOUSE GOING UNDER CONTRACT
          </Text>
          {housesLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
          ) : houseList.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No houses on this deal yet. Add a house first.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {houseList.map((h) => {
                const selected = effectiveHouseId === h.id;
                return (
                  <Pressable
                    key={h.id}
                    onPress={() => setHouseId(h.id)}
                    style={[
                      styles.houseRow,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected
                          ? colors.primary + '14'
                          : colors.surface,
                      },
                    ]}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={selected ? colors.primary : colors.textSecondary}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[styles.houseAddr, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {h.address}
                      </Text>
                      <Text
                        style={[
                          styles.housePrice,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {h.list_price
                          ? '$' + Number(h.list_price).toLocaleString()
                          : 'No price'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text
            style={[styles.label, { color: colors.textSecondary, marginTop: 24 }]}
          >
            SELLER (OPTIONAL)
          </Text>
          <Field
            placeholder="Seller name"
            value={sellerName}
            onChangeText={setSellerName}
            autoCapitalize="words"
            colors={colors}
          />
          <Field
            placeholder="Seller email"
            value={sellerEmail}
            onChangeText={setSellerEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            colors={colors}
          />

          <Text
            style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}
          >
            LISTING AGENT (OPTIONAL)
          </Text>
          <Field
            placeholder="Listing agent name"
            value={agentName}
            onChangeText={setAgentName}
            autoCapitalize="words"
            colors={colors}
          />
          <Field
            placeholder="Listing agent email"
            value={agentEmail}
            onChangeText={setAgentEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            colors={colors}
          />
          <Field
            placeholder="Listing agent firm"
            value={agentFirm}
            onChangeText={setAgentFirm}
            autoCapitalize="words"
            colors={colors}
          />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            If we recognize the listing agent&apos;s email and they&apos;re
            selling this same address in Realtor Portal, we&apos;ll connect the
            two sides automatically.
          </Text>

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={[
              styles.submit,
              { backgroundColor: canSubmit ? colors.primary : colors.border },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitLabel}>Mark under contract</Text>
            )}
          </Pressable>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  placeholder,
  value,
  onChangeText,
  autoCapitalize,
  keyboardType,
  colors,
}: {
  placeholder: string;
  value: string;
  onChangeText: (s: string) => void;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address';
  colors: any;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      autoCapitalize={autoCapitalize ?? 'sentences'}
      keyboardType={keyboardType ?? 'default'}
      style={[
        styles.input,
        {
          color: colors.text,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
      ]}
    />
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
  intro: { fontSize: 13, lineHeight: 18, marginBottom: 20 },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  hint: { fontSize: 12, marginTop: 8 },
  empty: { fontSize: 13, fontStyle: 'italic', paddingVertical: 12 },
  houseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  houseAddr: { fontSize: 14, fontWeight: '600' },
  housePrice: { fontSize: 12, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 10,
  },
  submit: {
    marginTop: 22,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitLabel: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
