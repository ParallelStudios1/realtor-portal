import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUpdateTourRequest } from '@/lib/mutations';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';
import { SkeletonRow, Skeleton } from '@/components/Skeleton';
import { TrialBanner } from '@/components/TrialBanner';

/**
 * Realtor home - first screen after sign-in. Shows a snapshot of the day:
 * client count, unread messages, recent activity. Quick links to common
 * actions (invite a client, view dashboard).
 */
export default function RealtorHome() {
  const { userProfile } = useAuth();
  const { colors } = useTheme();
  const updateTour = useUpdateTourRequest();
  const toast = useToast();
  const [expandedTour, setExpandedTour] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ['realtor-home-stats', userProfile?.firm_id],
    queryFn: async () => {
      if (!userProfile?.firm_id) return null;
      const [clients, searches, recent] = await Promise.all([
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('firm_id', userProfile.firm_id)
          .eq('role', 'client'),
        supabase
          .from('client_searches')
          .select('id', { count: 'exact', head: true })
          .eq('firm_id', userProfile.firm_id)
          .neq('phase', 'closed'),
        supabase
          .from('messages')
          .select('id, body, created_at, search_id')
          .eq('firm_id', userProfile.firm_id)
          .order('created_at', { ascending: false })
          .limit(3),
      ]);
      return {
        clientCount: clients.count || 0,
        activeSearches: searches.count || 0,
        recentMessages: (recent.data || []) as any[],
      };
    },
    enabled: !!userProfile?.firm_id,
  });

  const { data: pendingTours, refetch: refetchTours } = useQuery({
    queryKey: ['pendingTours', userProfile?.firm_id],
    queryFn: async () => {
      if (!userProfile?.firm_id) return [];
      const { data, error } = await supabase
        .from('tour_requests')
        .select(
          `id, preferred_when, notes, created_at, search_id, house_id, client_id,
           house:houses ( id, address ),
           client:users!tour_requests_client_id_fkey ( id, full_name, email )`
        )
        .eq('firm_id', userProfile.firm_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!userProfile?.firm_id,
  });

  const handleAct = async (
    tourRequestId: string,
    status: 'confirmed' | 'declined'
  ) => {
    setActingOn(tourRequestId);
    try {
      await updateTour.mutateAsync({ tourRequestId, status });
      await refetchTours();
      toast.show(
        status === 'confirmed'
          ? 'Tour confirmed - the client was notified.'
          : 'Tour declined.',
        { variant: 'success' }
      );
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setActingOn(null);
      setExpandedTour(null);
    }
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={[s.greeting, { color: colors.text }]}>
          Hey{userProfile?.full_name ? `, ${userProfile.full_name.split(' ')[0]}` : ''}
        </Text>
        <Text style={[s.sub, { color: colors.textSecondary }]}>
          Here's your day at a glance.
        </Text>

        {/* Trial countdown + manage-plan link (no in-app payment). The
            banner's own horizontal margin is cancelled here since this
            ScrollView is already padded. */}
        <View style={{ marginHorizontal: -20 }}>
          <TrialBanner firmId={userProfile?.firm_id} />
        </View>

        <View style={s.statRow}>
          {stats === undefined ? (
            <>
              <View
                style={[
                  s.stat,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Skeleton width={20} height={20} borderRadius={10} />
                <Skeleton width="60%" height={22} style={{ marginTop: 6 }} />
                <Skeleton width="40%" height={11} style={{ marginTop: 4 }} />
              </View>
              <View
                style={[
                  s.stat,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Skeleton width={20} height={20} borderRadius={10} />
                <Skeleton width="60%" height={22} style={{ marginTop: 6 }} />
                <Skeleton width="50%" height={11} style={{ marginTop: 4 }} />
              </View>
            </>
          ) : (
            <>
              <StatCard
                icon="people-outline"
                label="Clients"
                value={String(stats?.clientCount ?? '-')}
                colors={colors}
              />
              <StatCard
                icon="briefcase-outline"
                label="Active deals"
                value={String(stats?.activeSearches ?? '-')}
                colors={colors}
              />
            </>
          )}
        </View>

        <Text style={[s.sectionTitle, { color: colors.text }]}>
          Quick actions
        </Text>
        <View style={s.actions}>
          <Action
            icon="person-add-outline"
            label="Invite a client"
            onPress={() => router.push('/(realtor)/invite' as any)}
            colors={colors}
          />
          <Action
            icon="chatbubble-ellipses-outline"
            label="Open messages"
            onPress={() => router.push('/(realtor)/messages')}
            colors={colors}
          />
          {(userProfile?.role === 'owner' ||
            userProfile?.role === 'firm_admin' ||
            userProfile?.role === 'manager' ||
            userProfile?.role === 'super_admin') && (
            <>
              <Action
                icon="people-outline"
                label="Firm control"
                onPress={() => router.push('/(realtor)/firm' as any)}
                colors={colors}
              />
              <Action
                icon="trending-up-outline"
                label="Oversight"
                onPress={() => router.push('/(realtor)/oversight' as any)}
                colors={colors}
              />
            </>
          )}
        </View>

        {pendingTours && pendingTours.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { color: colors.text }]}>
              Pending tour requests
            </Text>
            {pendingTours.map((t) => {
              const expanded = expandedTour === t.id;
              const acting = actingOn === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setExpandedTour(expanded ? null : t.id)}
                  style={[
                    s.tourCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={s.tourHeader}>
                    <Ionicons
                      name="home-outline"
                      size={18}
                      color={colors.primary}
                    />
                    <Text
                      style={[s.tourAddress, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {t.house?.address || 'House'}
                    </Text>
                  </View>
                  <Text
                    style={[s.tourMeta, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {(t.client?.full_name || t.client?.email || 'Client') +
                      (t.preferred_when ? ` · ${t.preferred_when}` : '')}
                  </Text>
                  {t.notes ? (
                    <Text
                      style={[s.tourNotes, { color: colors.textSecondary }]}
                      numberOfLines={expanded ? undefined : 1}
                    >
                      {t.notes}
                    </Text>
                  ) : null}

                  {expanded && (
                    <View style={s.tourActions}>
                      <Pressable
                        disabled={acting}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          handleAct(t.id, 'declined');
                        }}
                        style={[
                          s.tourBtn,
                          {
                            borderColor: colors.border,
                            backgroundColor: colors.background,
                          },
                        ]}
                      >
                        <Text
                          style={[s.tourBtnText, { color: colors.text }]}
                        >
                          Decline
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={acting}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          handleAct(t.id, 'confirmed');
                        }}
                        style={[
                          s.tourBtn,
                          { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                      >
                        {acting ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={[s.tourBtnText, { color: '#fff' }]}>
                            Confirm
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </>
        )}

        {stats === undefined ? (
          <>
            <Text style={[s.sectionTitle, { color: colors.text }]}>
              Recent messages
            </Text>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : stats?.recentMessages && stats.recentMessages.length > 0 ? (
          <>
            <Text style={[s.sectionTitle, { color: colors.text }]}>
              Recent messages
            </Text>
            {stats.recentMessages.map((m) => (
              <View
                key={m.id}
                style={[
                  s.recentRow,
                  { borderBottomColor: colors.border },
                ]}
              >
                <Text
                  style={[s.recentBody, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {m.body}
                </Text>
                <Text style={[s.recentTime, { color: colors.textSecondary }]}>
                  {new Date(m.created_at).toLocaleString()}
                </Text>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  icon,
  label,
  value,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={[s.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={[s.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[s.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  colors: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.action,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Ionicons name={icon} size={22} color={colors.primary} />
      <Text style={[s.actionLabel, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  greeting: { fontSize: 26, fontWeight: '800' },
  sub: { fontSize: 14, marginTop: 4, marginBottom: 20 },
  statRow: { flexDirection: 'row', gap: 12 },
  stat: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: '800', marginTop: 6 },
  statLabel: { fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginTop: 24, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 12 },
  action: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionLabel: { fontSize: 13, fontWeight: '600' },
  recentRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  recentBody: { fontSize: 14 },
  recentTime: { fontSize: 11, marginTop: 4 },
  tourCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  tourHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tourAddress: { fontSize: 14, fontWeight: '700', flex: 1 },
  tourMeta: { fontSize: 12, marginTop: 4 },
  tourNotes: { fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  tourActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  tourBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  tourBtnText: { fontSize: 13, fontWeight: '700' },
});
