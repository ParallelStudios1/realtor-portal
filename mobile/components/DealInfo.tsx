import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatPrice } from '@/lib/format';

/**
 * Read-only deal-info blocks shown to EVERY party on both the realtor and
 * client deal surfaces, so every number entered at any step is visible to
 * everyone: financials, logged offers, and signing links with designated
 * signers. Mirrors the web all-parties deal view.
 */

function money(v: any): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return formatPrice(n);
}

export function FinancialsCard({
  search,
  colors,
}: {
  search: any;
  colors: any;
}) {
  const rows: { label: string; value: string }[] = [];
  const push = (label: string, v: string | null) => {
    if (v) rows.push({ label, value: v });
  };
  push('Agreed price', money(search?.agreed_price));
  push('Offer amount', money(search?.offer_amount));
  push('Counter offer', money(search?.counter_offer_amount));
  push('Closing amount', money(search?.closing_amount));
  push('Earnest money', money(search?.earnest_money));
  if (search?.commission_pct != null && Number(search.commission_pct) > 0)
    rows.push({ label: 'Commission', value: `${search.commission_pct}%` });
  if (search?.closing_date)
    rows.push({
      label: 'Closing date',
      value: new Date(search.closing_date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    });

  if (rows.length === 0 && !search?.contract_url) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        FINANCIALS
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {rows.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No financial terms entered yet.
          </Text>
        ) : (
          rows.map((r) => (
            <View key={r.label} style={styles.finRow}>
              <Text style={[styles.finLabel, { color: colors.textSecondary }]}>
                {r.label}
              </Text>
              <Text style={[styles.finValue, { color: colors.text }]}>
                {r.value}
              </Text>
            </View>
          ))
        )}
        {search?.contract_url ? (
          <Pressable
            onPress={() => Linking.openURL(search.contract_url)}
            style={{ paddingTop: 10 }}
          >
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>
              View contract →
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function OffersCard({
  offers,
  colors,
}: {
  offers: any[];
  colors: any;
}) {
  if (!offers || offers.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        OFFERS RECEIVED ({offers.length})
      </Text>
      {offers.map((o) => (
        <View
          key={o.id}
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              marginBottom: 8,
            },
          ]}
        >
          <View style={styles.offerHead}>
            <Text style={[styles.offerAmount, { color: colors.text }]}>
              {money(o.amount) || 'Offer'}
            </Text>
            <View
              style={[styles.statusPill, { borderColor: colors.primary }]}
            >
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>
                {String(o.status || 'received').toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={[styles.offerMeta, { color: colors.textSecondary }]}>
            {[
              o.buyer_name,
              o.buyer_agent ? `agent ${o.buyer_agent}` : null,
              o.financing,
              money(o.earnest_money) ? `${money(o.earnest_money)} earnest` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {o.offer_date ? (
            <Text style={[styles.offerMeta, { color: colors.textSecondary }]}>
              {new Date(o.offer_date).toLocaleDateString()}
            </Text>
          ) : null}
          {o.notes ? (
            <Text style={[styles.offerNotes, { color: colors.text }]}>{o.notes}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function SigningLinksCard({
  envelopes,
  colors,
}: {
  envelopes: any[];
  colors: any;
}) {
  if (!envelopes || envelopes.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        SIGNING LINKS ({envelopes.length})
      </Text>
      {envelopes.map((env) => {
        const rec: any = env.recipients;
        const label =
          (Array.isArray(rec) ? rec.find((r: any) => r?.label)?.label : rec?.label) ||
          'Document to sign';
        const signers: any[] = Array.isArray(rec)
          ? rec.filter((r: any) => r?.key || r?.name)
          : Array.isArray(rec?.signers)
            ? rec.signers
            : [];
        const signed = env.status === 'completed';
        const signedCount = signers.filter((s) => s.signed).length;
        return (
          <View
            key={env.id}
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                marginBottom: 8,
              },
            ]}
          >
            <View style={styles.offerHead}>
              <Text
                style={[styles.offerAmount, { color: colors.text, fontSize: 14 }]}
                numberOfLines={1}
              >
                {label}
              </Text>
              <View
                style={[
                  styles.statusPill,
                  {
                    borderColor: signed ? colors.success : colors.warning,
                  },
                ]}
              >
                <Text
                  style={{
                    color: signed ? colors.success : colors.warning,
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  {signed ? 'SIGNED' : 'AWAITING'}
                </Text>
              </View>
            </View>
            {signers.length > 0 ? (
              <Text style={[styles.offerMeta, { color: colors.textSecondary }]}>
                {signedCount}/{signers.length} signed ·{' '}
                {signers
                  .map((s: any) => `${s.name}${s.signed ? ' ✓' : ''}`)
                  .join(', ')}
              </Text>
            ) : null}
            {env.envelope_url && !signed ? (
              <Pressable
                onPress={() => Linking.openURL(env.envelope_url)}
                style={{ paddingTop: 8 }}
              >
                <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>
                  Open to sign →
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Clickable tour-request cards. Tap to expand full detail. On the realtor
 * side, pass onConfirm/onDecline to act; the client side just sees the info.
 */
export function TourRequestsCard({
  tours,
  colors,
  onConfirm,
  onDecline,
  actingId,
}: {
  tours: any[];
  colors: any;
  onConfirm?: (id: string) => void;
  onDecline?: (id: string) => void;
  actingId?: string | null;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const pending = (tours || []).filter(
    (t) => (t.status || 'pending') === 'pending'
  );
  const others = (tours || []).filter(
    (t) => (t.status || 'pending') !== 'pending'
  );
  if (!tours || tours.length === 0) return null;

  const renderTour = (t: any, isPending: boolean) => {
    const when = t.requested_at
      ? new Date(t.requested_at)
      : t.preferred_when
        ? new Date(t.preferred_when)
        : null;
    const whenLabel = when
      ? when.toLocaleString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : t.preferred_when || 'Time TBD';
    const open = expanded === t.id;
    const acting = actingId === t.id;
    return (
      <Pressable
        key={t.id}
        onPress={() => setExpanded(open ? null : t.id)}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: open ? colors.primary : colors.border,
            marginBottom: 8,
          },
        ]}
      >
        <View style={styles.tourHead}>
          <Ionicons
            name="calendar-outline"
            size={16}
            color={colors.primary}
          />
          <Text style={[styles.tourAddr, { color: colors.text }]} numberOfLines={1}>
            {t.house?.address || 'Tour request'}
          </Text>
          {isPending ? (
            <View style={[styles.statusPill, { borderColor: colors.warning }]}>
              <Text style={{ color: colors.warning, fontSize: 10, fontWeight: '700' }}>
                PENDING
              </Text>
            </View>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>
              {String(t.status).toUpperCase()}
            </Text>
          )}
        </View>
        <Text style={[styles.offerMeta, { color: colors.textSecondary }]}>
          {whenLabel}
        </Text>
        {open ? (
          <View style={{ marginTop: 6 }}>
            {t.notes ? (
              <Text style={[styles.offerNotes, { color: colors.text }]}>
                “{t.notes}”
              </Text>
            ) : (
              <Text style={[styles.offerMeta, { color: colors.textSecondary }]}>
                No notes from the client.
              </Text>
            )}
            {isPending && onConfirm && onDecline ? (
              <View style={styles.tourActions}>
                <Pressable
                  disabled={acting}
                  onPress={() => onDecline(t.id)}
                  style={[
                    styles.tourBtn,
                    { borderColor: colors.border, backgroundColor: colors.background },
                  ]}
                >
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                    Decline
                  </Text>
                </Pressable>
                <Pressable
                  disabled={acting}
                  onPress={() => onConfirm(t.id)}
                  style={[
                    styles.tourBtn,
                    { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                    {acting ? 'Working…' : 'Confirm'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.tapHint, { color: colors.textSecondary }]}>
            Tap to {isPending ? 'view & respond' : 'view details'}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        TOUR REQUESTS{pending.length ? ` · ${pending.length} pending` : ''}
      </Text>
      {pending.map((t) => renderTour(t, true))}
      {others.map((t) => renderTour(t, false))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingTop: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  empty: { fontSize: 13 },
  finRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  finLabel: { fontSize: 13 },
  finValue: { fontSize: 13, fontWeight: '700' },
  offerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  offerAmount: { fontSize: 16, fontWeight: '800', flex: 1 },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  offerMeta: { fontSize: 12, marginTop: 4 },
  offerNotes: { fontSize: 13, marginTop: 6, fontStyle: 'italic' },
  tourHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tourAddr: { fontSize: 14, fontWeight: '700', flex: 1 },
  tapHint: { fontSize: 11, marginTop: 6 },
  tourActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tourBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
});
