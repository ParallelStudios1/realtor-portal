import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFirm } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

/**
 * Web billing URL. Per Apple's rules we do NOT take payments inside the app
 * and we don't show prices here - this link opens the billing page in the
 * browser, where the firm owner manages their plan.
 */
export const MANAGE_PLAN_URL =
  'https://realtorportal.parallelstudios.co/dashboard/billing';

export function trialDaysLeft(trialEndsAt: string | null | undefined): number | null {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * Trial status banner for the realtor app. Shows how many days remain on the
 * free trial and a "Manage plan" button. Renders nothing for firms on an
 * active paid plan. `compact` is used in headers.
 */
export function TrialBanner({
  firmId,
  compact = false,
  flush = false,
}: {
  firmId: string | null | undefined;
  compact?: boolean;
  // When true, drop the built-in horizontal margin (use inside an already-
  // padded container so the banner aligns with sibling content).
  flush?: boolean;
}) {
  const { colors } = useTheme();
  const { data: firm } = useFirm(firmId);
  if (!firm) return null;

  const status = (firm as any).status as string | null;
  const hasSub = Boolean((firm as any).stripe_subscription_id);
  // Active paid plan - nothing to nag about.
  if (status === 'active' || hasSub) return null;

  const days = trialDaysLeft((firm as any).trial_ends_at);
  const ended = status === 'trial' ? days !== null && days <= 0 : status !== 'trial';

  const tone = ended ? colors.error || '#dc2626' : (days ?? 99) <= 3 ? (colors.warning || '#d97706') : colors.primary;
  const headline = ended
    ? 'Your free trial has ended'
    : days === null
      ? 'You are on a free trial'
      : `${days} day${days === 1 ? '' : 's'} left in your free trial`;
  const sub = ended
    ? 'Manage your plan to keep your portal active.'
    : 'No payment is taken in the app. Manage your plan online.';

  return (
    <View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        flush && { marginHorizontal: 0 },
        { borderColor: tone, backgroundColor: colors.surface },
      ]}
    >
      <View style={styles.row}>
        <Ionicons
          name={ended ? 'alert-circle' : 'time-outline'}
          size={compact ? 16 : 18}
          color={tone}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.headline, { color: colors.text }]} numberOfLines={1}>
            {headline}
          </Text>
          {!compact && (
            <Text style={[styles.sub, { color: colors.textSecondary }]}>{sub}</Text>
          )}
        </View>
        <Pressable
          onPress={() => Linking.openURL(MANAGE_PLAN_URL)}
          style={[styles.btn, { backgroundColor: tone }]}
        >
          <Text style={styles.btnText}>Manage plan</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  wrapCompact: { marginTop: 8, padding: 10, borderRadius: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headline: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
