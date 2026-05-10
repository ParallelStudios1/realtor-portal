import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Realtor home — first screen after sign-in. Shows a snapshot of the day:
 * client count, unread messages, recent activity. Quick links to common
 * actions (invite a client, view dashboard).
 */
export default function RealtorHome() {
  const { userProfile } = useAuth();
  const { colors } = useTheme();

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

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={[s.greeting, { color: colors.text }]}>
          Hey{userProfile?.full_name ? `, ${userProfile.full_name.split(' ')[0]}` : ''}
        </Text>
        <Text style={[s.sub, { color: colors.textSecondary }]}>
          Here's your day at a glance.
        </Text>

        <View style={s.statRow}>
          <StatCard
            icon="people-outline"
            label="Clients"
            value={String(stats?.clientCount ?? '—')}
            colors={colors}
          />
          <StatCard
            icon="search-outline"
            label="Active searches"
            value={String(stats?.activeSearches ?? '—')}
            colors={colors}
          />
        </View>

        <Text style={[s.sectionTitle, { color: colors.text }]}>
          Quick actions
        </Text>
        <View style={s.actions}>
          <Action
            icon="person-add-outline"
            label="Invite a client"
            onPress={() => router.push('/(realtor)/clients')}
            colors={colors}
          />
          <Action
            icon="chatbubble-ellipses-outline"
            label="Open messages"
            onPress={() => router.push('/(realtor)/messages')}
            colors={colors}
          />
        </View>

        {stats?.recentMessages && stats.recentMessages.length > 0 && (
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
        )}
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
});
