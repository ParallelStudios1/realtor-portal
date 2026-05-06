import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Pressable,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import {
  useSearch,
  useHouses,
  useImportantDates,
  useDocuments,
  useActivities,
} from '@/lib/queries';
import { useUpdatePhase, useLogActivity } from '@/lib/mutations';
import { PhaseStepper } from '@/components/PhaseStepper';
import { ImportantDateRow } from '@/components/ImportantDateRow';
import { ActivityRow } from '@/components/ActivityRow';
import { formatPhase } from '@/lib/format';
import type { DealPhase } from '@/lib/database.types';

const PHASES: DealPhase[] = ['searching', 'offer_made', 'under_contract', 'closing', 'closed'];

/**
 * Realtor's deal detail screen.
 * Shows phase stepper (with edit), houses, important dates, documents, activity, messages.
 */
export default function RealtorClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userProfile, user } = useAuth();
  const { colors } = useTheme();

  const { data: search, isLoading, refetch: refetchSearch } = useSearch(id);
  const { data: houses, refetch: refetchHouses } = useHouses(id);
  const { data: dates, refetch: refetchDates } = useImportantDates(id);
  const { data: documents, refetch: refetchDocs } = useDocuments(id);
  const { data: activities, refetch: refetchActivities } = useActivities(id);

  const updatePhase = useUpdatePhase();
  const logActivity = useLogActivity();

  const onRefresh = async () => {
    await Promise.all([refetchSearch(), refetchHouses(), refetchDates(), refetchDocs(), refetchActivities()]);
  };

  const handlePhaseChange = (newPhase: DealPhase) => {
    if (!search || !userProfile?.firm_id || !user?.id) return;
    if (search.phase === newPhase) return;

    Alert.alert(
      'Move to ' + formatPhase(newPhase),
      `Are you sure you want to move this deal to "${formatPhase(newPhase)}"? The client will be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          style: 'default',
          onPress: async () => {
            try {
              await updatePhase.mutateAsync({ searchId: search.id, newPhase });
              await logActivity.mutateAsync({
                searchId: search.id,
                firmId: userProfile.firm_id!,
                actorId: user.id,
                action: 'moved',
                target: 'Deal Phase',
                metadata: { from: search.phase, to: newPhase },
              });
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to update phase');
            }
          },
        },
      ],
    );
  };

  if (isLoading || !search) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{search.name}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Started {new Date(search.started_at).toLocaleDateString()}
          </Text>
        </View>

        {/* Phase stepper */}
        <Section title="Deal Progress" colors={colors}>
          <PhaseStepper currentPhase={search.phase} />
          <View style={styles.phaseRow}>
            {PHASES.map((p) => {
              const isCurrent = p === search.phase;
              return (
                <Pressable
                  key={p}
                  onPress={() => handlePhaseChange(p)}
                  style={[
                    styles.phaseButton,
                    {
                      backgroundColor: isCurrent ? colors.primary : 'transparent',
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.phaseButtonText,
                      { color: isCurrent ? '#fff' : colors.primary },
                    ]}
                  >
                    {formatPhase(p)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* Houses */}
        <Section title={`Houses (${houses?.length ?? 0})`} colors={colors}>
          {(houses ?? []).length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>No houses yet</Text>
          ) : (
            (houses ?? []).slice(0, 5).map((h) => (
              <Pressable
                key={h.id}
                onPress={() => router.push(`/(realtor)/clients/${id}/houses/${h.id}` as any)}
                style={({ pressed }) => [
                  styles.houseRow,
                  { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.houseAddr, { color: colors.text }]}>{h.address}</Text>
                  {h.list_price ? (
                    <Text style={[styles.housePrice, { color: colors.textSecondary }]}>
                      ${Number(h.list_price).toLocaleString()}
                      {h.bedrooms ? ` · ${h.bedrooms}bd` : ''}
                      {h.bathrooms ? ` · ${h.bathrooms}ba` : ''}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.houseStatusChip, { color: colors.primary, borderColor: colors.primary }]}>
                  {h.status.replace('_', ' ')}
                </Text>
              </Pressable>
            ))
          )}
          <Pressable
            onPress={() => router.push(`/(realtor)/clients/${id}/add-house` as any)}
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.actionBtnText}>+ Add House</Text>
          </Pressable>
        </Section>

        {/* Important dates */}
        <Section title={`Important Dates (${dates?.length ?? 0})`} colors={colors}>
          {(dates ?? []).length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>No dates yet</Text>
          ) : (
            (dates ?? []).map((d) => <ImportantDateRow key={d.id} date={d} />)
          )}
          <Pressable
            onPress={() => router.push(`/(realtor)/clients/${id}/add-date` as any)}
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.actionBtnText}>+ Add Important Date</Text>
          </Pressable>
        </Section>

        {/* Documents */}
        <Section title={`Documents (${documents?.length ?? 0})`} colors={colors}>
          {(documents ?? []).length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>No documents uploaded</Text>
          ) : (
            (documents ?? []).map((d) => (
              <Text key={d.id} style={[styles.docRow, { color: colors.text }]}>📄 {d.name}</Text>
            ))
          )}
          <Pressable
            onPress={() => router.push(`/(realtor)/clients/${id}/upload` as any)}
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.actionBtnText}>+ Upload Document</Text>
          </Pressable>
        </Section>

        {/* Recent activity */}
        <Section title="Recent Activity" colors={colors}>
          {(activities ?? []).length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>No activity yet</Text>
          ) : (
            (activities ?? []).slice(0, 8).map((a) => <ActivityRow key={a.id} activity={a} />)
          )}
        </Section>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  colors,
  children,
}: {
  title: string;
  colors: ReturnType<typeof useTheme>['colors'];
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, { borderBottomColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 24, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4 },
  section: { paddingHorizontal: 20, paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  phaseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  phaseButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  phaseButtonText: { fontSize: 12, fontWeight: '600' },
  houseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  houseAddr: { fontSize: 14, fontWeight: '500' },
  housePrice: { fontSize: 12, marginTop: 2 },
  houseStatusChip: {
    fontSize: 10,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    textTransform: 'capitalize',
  },
  docRow: { fontSize: 14, paddingVertical: 6 },
  empty: { fontSize: 13, fontStyle: 'italic' },
  actionBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  actionBtnText: { color: '#fff', fontWeight: '600' },
});
