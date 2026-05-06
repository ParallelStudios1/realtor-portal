import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useClientSearches, useActivities } from '@/lib/queries';
import { ActivityRow } from '@/components/ActivityRow';
import { useQueryClient } from '@tanstack/react-query';

export default function ActivityScreen() {
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();
  const queryClient = useQueryClient();

  const { data: searches, isLoading: searchesLoading, refetch: refetchSearches } = useClientSearches(
    userProfile?.firm_id,
    false,
    user?.id
  );

  const activeSearch = searches?.[0];
  const { data: activities, isLoading: activitiesLoading, refetch: refetchActivities } = useActivities(activeSearch?.id);

  const onRefresh = async () => {
    await Promise.all([refetchSearches(), refetchActivities()]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={searchesLoading || activitiesLoading}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {(searchesLoading || activitiesLoading) && !activities ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={styles.loader}
          />
        ) : !activeSearch ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
              No active search yet
            </Text>
          </View>
        ) : activities && activities.length > 0 ? (
          <View style={styles.list}>
            {activities.map((activity) => (
              <ActivityRow
                key={activity.id}
                activity={activity}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
              No activity yet. Your realtor will update you soon!
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    marginTop: 40,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
