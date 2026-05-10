import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
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

/**
 * Realtor's home screen — every active client/deal in the firm.
 * Tapping a row drills into the client's deal detail.
 */
export default function RealtorClientsScreen() {
  const { userProfile } = useAuth();
  const { colors } = useTheme();
  const { data: searches, isLoading, refetch, isRefetching } = useClientSearches(
    userProfile?.firm_id,
    true, // isRealtor — fetch all firm searches, not just current user's
  );

  if (isLoading && !searches) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
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
              onPress={() => router.push('/(realtor)/invite' as any)}
              style={[styles.inviteCta, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="person-add" size={16} color="#fff" />
              <Text style={styles.inviteCtaText}>Invite a client</Text>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No clients yet
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
              Invite your first buyer or seller — they'll get an email and
              show up here right away.
            </Text>
            <Pressable
              onPress={() => router.push('/(realtor)/invite' as any)}
              style={[styles.inviteBigCta, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="person-add" size={18} color="#fff" />
              <Text style={styles.inviteBigCtaText}>Invite a client</Text>
            </Pressable>
          </View>
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
        <Text style={[styles.phaseChipText, { color: colors.primary }]}>{formatPhase(search.phase)}</Text>
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
