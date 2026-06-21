import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useFirm } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { MANAGE_PLAN_URL } from '@/components/TrialBanner';

const BROKER_ROLES = ['owner', 'firm_admin', 'super_admin'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysUntil(d: string) {
  const t = new Date(String(d).slice(0, 10) + 'T00:00:00Z').getTime();
  const n = new Date(todayStr() + 'T00:00:00Z').getTime();
  return Math.round((t - n) / 86_400_000);
}

export default function OversightScreen() {
  const { userProfile } = useAuth();
  const { colors } = useTheme();
  const { data: firm } = useFirm(userProfile?.firm_id);

  const isBroker = BROKER_ROLES.includes(userProfile?.role || '');
  const tier = (firm as any)?.plan_tier as string | null;
  const hasTeamOversight = tier === 'team' || tier === 'brokerage';

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ['oversight', userProfile?.firm_id],
    enabled: !!userProfile?.firm_id && isBroker && hasTeamOversight,
    queryFn: async () => {
      const today = todayStr();
      const horizon = new Date(today + 'T00:00:00Z');
      horizon.setUTCDate(horizon.getUTCDate() + 2);
      const { data, error } = await supabase
        .from('important_dates')
        .select(
          'id, label, date, search_id, acknowledged_at, search:client_searches!important_dates_search_id_fkey ( id, name, realtor:users!client_searches_realtor_id_fkey ( full_name, email ) )'
        )
        .eq('firm_id', userProfile!.firm_id)
        .is('completed_at', null)
        .lte('date', horizon.toISOString().slice(0, 10))
        .order('date', { ascending: true });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  if (!isBroker) {
    return (
      <SafeAreaView style={[s.c, { backgroundColor: colors.background }]}>
        <View style={s.center}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.textSecondary} />
          <Text style={[s.muted, { color: colors.textSecondary }]}>
            Oversight is available to firm owners and admins.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasTeamOversight) {
    return (
      <SafeAreaView style={[s.c, { backgroundColor: colors.background }]}>
        <View style={s.center}>
          <Ionicons name="trending-up-outline" size={28} color={colors.primary} />
          <Text style={[s.h1, { color: colors.text, marginTop: 10 }]}>Deadline oversight</Text>
          <Text style={[s.muted, { color: colors.textSecondary }]}>
            Firm-wide deadline oversight is part of the Team plan. Upgrade to see
            every agent's overdue and at-risk deadlines in one place.
          </Text>
          <Pressable
            onPress={() => Linking.openURL(MANAGE_PLAN_URL)}
            style={[s.btn, { backgroundColor: colors.primary }]}
          >
            <Text style={s.btnText}>Upgrade plan</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const overdue = (rows || []).filter((r) => daysUntil(r.date) < 0);
  const atRisk = (rows || []).filter((r) => {
    const d = daysUntil(r.date);
    return d >= 0 && d <= 2 && !r.acknowledged_at;
  });

  const Section = ({ title, items, tone }: { title: string; items: any[]; tone: string }) => (
    <>
      <Text style={[s.sectionLabel, { color: tone }]}>
        {title} ({items.length})
      </Text>
      {items.length === 0 ? (
        <Text style={[s.muted, { color: colors.textSecondary, paddingHorizontal: 16 }]}>None.</Text>
      ) : (
        items.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => router.push(`/(realtor)/clients/${r.search_id}` as any)}
            style={[s.row, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <View style={[s.dot, { backgroundColor: tone }]} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{r.label}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {r.search?.name || 'Deal'} ·{' '}
                {r.search?.realtor?.full_name || r.search?.realtor?.email || 'Unassigned'}
              </Text>
            </View>
            <Text style={{ color: tone, fontSize: 12, fontWeight: '700' }}>
              {daysUntil(r.date) < 0
                ? `${Math.abs(daysUntil(r.date))}d late`
                : daysUntil(r.date) === 0
                  ? 'today'
                  : `in ${daysUntil(r.date)}d`}
            </Text>
          </Pressable>
        ))
      )}
    </>
  );

  return (
    <SafeAreaView style={[s.c, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.primary} />}
      >
        <Text style={[s.h1, { color: colors.text }]}>Deadline oversight</Text>
        <Text style={[s.muted, { color: colors.textSecondary }]}>
          Overdue and at-risk deadlines across your whole firm.
        </Text>
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
        ) : (
          <>
            <Section title="OVERDUE" items={overdue} tone={colors.error || '#dc2626'} />
            <Section title="AT RISK" items={atRisk} tone={colors.warning || '#d97706'} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  h1: { fontSize: 26, fontWeight: '800' },
  muted: { fontSize: 13, marginTop: 6, textAlign: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 22, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  btn: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
});
