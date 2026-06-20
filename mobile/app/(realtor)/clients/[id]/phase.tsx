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
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useSearch, useHouses } from '@/lib/queries';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';
import { phaseLabelFor } from '@/lib/dealKind';

/**
 * Realtor phase-change screen — parity with the web phase-update flow.
 *
 * Staff picks a target phase and, for offer_made / counter_offer / closing /
 * closed, the screen reveals + requires the right fields. On submit we POST to
 * the deployed /api/deals/{searchId}/phase endpoint (Bearer auth, JSON).
 *
 * Validation failures come back HTTP 200 with { ok:false, error } — we check
 * `ok` and surface `error` via a toast. `under_contract` is intentionally
 * absent from the picker here; it uses the dedicated Under contract screen.
 *
 * Required fields enforced both client-side (button gating + inline hints) and
 * server-side:
 *   - offer_made   → offer_amount + offer_house_id
 *   - counter_offer→ counter_offer_amount
 *   - closing      → closing_date + closing_amount
 *   - closed       → closing_amount (falls back to the deal's existing amount)
 */

type Phase = 'searching' | 'awaiting_offer' | 'offer_made' | 'counter_offer' | 'closing' | 'closed';

const PHASE_OPTIONS: { id: Phase; label: string; hint: string }[] = [
  { id: 'searching', label: 'Searching', hint: 'Back to actively looking.' },
  { id: 'awaiting_offer', label: 'Awaiting offer', hint: 'Home agreed — preparing the offer.' },
  {
    id: 'offer_made',
    label: 'Offer made',
    hint: 'Needs an offer amount + which house the offer is on.',
  },
  {
    id: 'counter_offer',
    label: 'Counter offer',
    hint: 'Needs the counter-offer amount.',
  },
  {
    id: 'closing',
    label: 'Closing',
    hint: 'Needs a closing date + closing amount.',
  },
  {
    id: 'closed',
    label: 'Closed',
    hint: 'Needs the final closing amount.',
  },
];

function apiBaseUrl() {
  return (
    (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
    'https://realtorportal.parallelstudios.co'
  ).replace(/\/$/, '');
}

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function PhaseScreen() {
  const { id: searchId } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: search } = useSearch(searchId);
  const { data: houses, isLoading: housesLoading } = useHouses(searchId);
  const houseList = useMemo(() => (houses ?? []) as any[], [houses]);

  const [phase, setPhase] = useState<Phase | null>(null);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerHouseId, setOfferHouseId] = useState<string | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [closedMessage, setClosedMessage] = useState('');
  const [closingDate, setClosingDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Client-side gate mirroring the server's per-phase requirements.
  const canSubmit = useMemo(() => {
    if (!searchId || !phase || submitting) return false;
    if (phase === 'offer_made') {
      return !!parseMoney(offerAmount) && !!offerHouseId;
    }
    if (phase === 'counter_offer') {
      return !!parseMoney(counterAmount);
    }
    if (phase === 'closing') {
      return !!closingDate && !!parseMoney(closingAmount);
    }
    if (phase === 'closed') {
      // closing_amount falls back server-side to the existing deal amount.
      return (
        !!parseMoney(closingAmount) ||
        !!(search as any)?.closing_amount
      );
    }
    return true; // searching
  }, [
    searchId,
    phase,
    submitting,
    offerAmount,
    offerHouseId,
    counterAmount,
    closingDate,
    closingAmount,
    search,
  ]);

  const submit = async () => {
    if (!searchId || !phase) {
      toast.show('Pick a target phase first.', { variant: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const body: Record<string, any> = { phase };
      if (phase === 'offer_made') {
        body.offer_amount = parseMoney(offerAmount);
        body.offer_house_id = offerHouseId;
      }
      if (phase === 'counter_offer') {
        body.counter_offer_amount = parseMoney(counterAmount);
      }
      if (phase === 'closing') {
        body.closing_date = closingDate
          ? closingDate.toISOString().slice(0, 10)
          : undefined;
        body.closing_amount = parseMoney(closingAmount);
      }
      if (phase === 'closed') {
        const amt = parseMoney(closingAmount);
        if (amt != null) body.closing_amount = amt;
        if (closedMessage.trim()) body.closed_message = closedMessage.trim();
      }

      const r = await fetch(`${apiBaseUrl()}/api/deals/${searchId}/phase`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const raw = await r.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {}
      // Validation failures come back HTTP 200 with ok:false — check ok.
      if (!r.ok || !json?.ok) {
        throw new Error(json?.error || `Failed (HTTP ${r.status}).`);
      }

      // Refresh everything the deal + client home screens read.
      queryClient.invalidateQueries({ queryKey: ['search', searchId] });
      queryClient.invalidateQueries({ queryKey: ['clientSearches'] });
      queryClient.invalidateQueries({ queryKey: ['activities', searchId] });
      queryClient.invalidateQueries({ queryKey: ['houses', searchId] });

      toast.show('Deal phase updated.', { variant: 'success' });
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
          Update phase
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
            Move this deal to a new phase. The client gets a celebration message
            on milestones. To go under contract, use the dedicated Under
            contract action.
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            TARGET PHASE
          </Text>
          <View style={styles.pillGrid}>
            {PHASE_OPTIONS.map((p) => {
              const selected = phase === p.id;
              const current = (search as any)?.phase === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setPhase(p.id)}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? '#fff' : colors.text,
                      fontWeight: '600',
                      fontSize: 13,
                    }}
                  >
                    {phaseLabelFor(p.id, (search as any)?.kind)}
                    {current ? ' (now)' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {phase && (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              {PHASE_OPTIONS.find((p) => p.id === phase)?.hint}
            </Text>
          )}

          {/* offer_made → amount + house */}
          {phase === 'offer_made' && (
            <>
              <Text
                style={[styles.label, { color: colors.textSecondary, marginTop: 24 }]}
              >
                OFFER AMOUNT
              </Text>
              <TextInput
                value={offerAmount}
                onChangeText={setOfferAmount}
                placeholder="$450,000"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              />

              <Text
                style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}
              >
                HOUSE THE OFFER IS ON
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
                    const selected = offerHouseId === h.id;
                    return (
                      <Pressable
                        key={h.id}
                        onPress={() => setOfferHouseId(h.id)}
                        style={[
                          styles.houseRow,
                          {
                            borderColor: selected
                              ? colors.primary
                              : colors.border,
                            backgroundColor: selected
                              ? colors.primary + '14'
                              : colors.surface,
                          },
                        ]}
                      >
                        <Ionicons
                          name={
                            selected ? 'radio-button-on' : 'radio-button-off'
                          }
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
            </>
          )}

          {/* counter_offer → counter amount */}
          {phase === 'counter_offer' && (
            <>
              <Text
                style={[styles.label, { color: colors.textSecondary, marginTop: 24 }]}
              >
                COUNTER-OFFER AMOUNT
              </Text>
              <TextInput
                value={counterAmount}
                onChangeText={setCounterAmount}
                placeholder="$465,000"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              />
            </>
          )}

          {/* closing → date + amount */}
          {phase === 'closing' && (
            <>
              <Text
                style={[styles.label, { color: colors.textSecondary, marginTop: 24 }]}
              >
                CLOSING DATE
              </Text>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={[
                  styles.input,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              >
                <Text
                  style={{
                    color: closingDate ? colors.text : colors.textSecondary,
                    fontSize: 16,
                  }}
                >
                  {closingDate
                    ? closingDate.toLocaleDateString()
                    : 'Pick a date'}
                </Text>
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={closingDate || new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={(e: DateTimePickerEvent, d?: Date) => {
                    if (Platform.OS !== 'ios') setShowDatePicker(false);
                    if (e.type === 'set' && d) setClosingDate(d);
                  }}
                />
              )}

              <Text
                style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}
              >
                CLOSING AMOUNT
              </Text>
              <TextInput
                value={closingAmount}
                onChangeText={setClosingAmount}
                placeholder="$460,000"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              />
            </>
          )}

          {/* closed → final amount + optional message */}
          {phase === 'closed' && (
            <>
              <Text
                style={[styles.label, { color: colors.textSecondary, marginTop: 24 }]}
              >
                FINAL CLOSING AMOUNT
              </Text>
              <TextInput
                value={closingAmount}
                onChangeText={setClosingAmount}
                placeholder={
                  (search as any)?.closing_amount
                    ? '$' + Number((search as any).closing_amount).toLocaleString()
                    : '$460,000'
                }
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              />
              {(search as any)?.closing_amount ? (
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  Leave blank to keep the existing amount ($
                  {Number((search as any).closing_amount).toLocaleString()}).
                </Text>
              ) : null}

              <Text
                style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}
              >
                CONGRATS MESSAGE (OPTIONAL)
              </Text>
              <TextInput
                value={closedMessage}
                onChangeText={setClosedMessage}
                placeholder="A note your client sees on their home screen"
                placeholderTextColor={colors.textSecondary}
                multiline
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    minHeight: 80,
                  },
                ]}
              />
            </>
          )}

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
              <Text style={styles.submitLabel}>Update phase</Text>
            )}
          </Pressable>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
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
  },
  submit: {
    marginTop: 28,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitLabel: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
