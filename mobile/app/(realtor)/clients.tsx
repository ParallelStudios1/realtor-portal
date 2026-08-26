import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useClientSearches } from '@/lib/queries';
import { formatPhase } from '@/lib/format';
import type { ClientSearch } from '@/lib/database.types';
import { SkeletonRow } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';

/**
 * Realtor's home screen - every active client/deal in the firm.
 * Tapping a row drills into the client's deal detail.
 */
export default function RealtorClientsScreen() {
  const { userProfile } = useAuth();
  const { colors } = useTheme();
  const { data: searches, isLoading, refetch, isRefetching } = useClientSearches(
    userProfile?.firm_id,
    true, // isRealtor - fetch all firm searches, not just current user's
  );

  // Law-firm attorneys start deals (their client is the referring realtor);
  // brokerages invite buyers/sellers. Same screen, correct flow for each.
  const isLawFirm = (userProfile as any)?.firm_type === 'law_firm';
  const ctaLabel = isLawFirm ? 'Start a deal' : 'Invite a client';
  const ctaIcon = isLawFirm ? 'briefcase' : 'person-add';
  const ctaRoute = isLawFirm ? '/(realtor)/start-deal' : '/(realtor)/invite';
  const emptyBody = isLawFirm
    ? 'Start your first deal - add the referring realtor and their buyer or seller, and it will show up here right away.'
    : 'Invite your first buyer or seller - their deal will show up here right away.';

  // First-load: render layout-stable skeleton rows.
  if (searches === undefined) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View>
          <SkeletonRow withChip />
          <SkeletonRow withChip />
          <SkeletonRow withChip />
          <SkeletonRow withChip />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={searches ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={searches && searches.length === 0 ? styles.emptyContainer : undefined}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          searches && searches.length > 0 ? (
            <Pressable
              onPress={() => router.push(ctaRoute as any)}
              style={[styles.inviteCta, { backgroundColor: colors.primary }]}
            >
              <Ionicons name={ctaIcon as any} size={16} color="#fff" />
              <Text style={styles.inviteCtaText}>{ctaLabel}</Text>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="briefcase-outline"
            title="No deals yet"
            body={emptyBody}
            ctaLabel={ctaLabel}
            ctaIcon={ctaIcon as any}
            onCtaPress={() => router.push(ctaRoute as any)}
          />
        }
        renderItem={({ item }) => (
          <ClientRow
            search={item}
            onPress={() =>
              router.push(`/(realtor)/clients/${item.id}` as any)
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

function ClientRow({ search, onPress }: { search: ClientSearch; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {search.name}
        </Text>
        <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
          Updated {new Date(search.updated_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={[styles.phaseChip, { backgroundColor: colors.primary + '22', borderColor: colors.primary }]}>
        <Text style={[styles.phaseChipText, { color: colors.primary }]}>{formatPhase(search.phase, (search as any).kind)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  rowSub: { fontSize: 12 },
  phaseChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: 12,
  },
  phaseChipText: { fontSize: 12, fontWeight: '600' },
  inviteCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    margin: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  inviteCtaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  inviteBigCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  inviteBigCtaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
