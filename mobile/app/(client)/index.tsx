import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useClientSearches, useImportantDates } from '@/lib/queries';
import { PhaseStepper } from '@/components/PhaseStepper';
import { ImportantDateRow } from '@/components/ImportantDateRow';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton, SkeletonRow } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';

export default function ClientHomeScreen() {
  const { user, userProfile } = useAuth();
  const { colors, firm, logoUrl } = useTheme();
  const queryClient = useQueryClient();

  const { data: searches, isLoading: searchesLoading, refetch: refetchSearches } = useClientSearches(
    userProfile?.firm_id,
    false,
    user?.id
  );

  const activeSearch = searches?.[0];
  const { data: importantDates, refetch: refetchDates } = useImportantDates(
    activeSearch?.id
  );

  const upcomingDates = useMemo(() => {
    return (importantDates ?? []).slice(0, 3);
  }, [importantDates]);

  const onRefresh = async () => {
    await Promise.all([refetchSearches(), refetchDates()]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={searchesLoading}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              {logoUrl && (
                <Text style={[styles.firmName, { color: colors.text }]}>
                  {firm?.name}
                </Text>
              )}
              <Text style={[styles.greeting, { color: colors.text }]}>
                Welcome, {userProfile?.full_name?.split(' ')[0]}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/(client)/profile' as any)}
              hitSlop={10}
              accessibilityLabel="Open profile"
              style={({ pressed }) => [
                styles.profileBtn,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Ionicons name="person-circle-outline" size={26} color={colors.text} />
            </Pressable>
          </View>
        </View>

        {searches === undefined ? (
          <>
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Deal Progress
              </Text>
              <Skeleton width="100%" height={48} borderRadius={8} />
            </View>
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Important Dates
              </Text>
              <SkeletonRow />
              <SkeletonRow />
            </View>
          </>
        ) : activeSearch ? (
          <>
            {/* Phase Stepper */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Deal Progress
              </Text>
              <PhaseStepper currentPhase={activeSearch.phase} />
            </View>

            {/* Upcoming Dates */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Important Dates
              </Text>
              {importantDates === undefined ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : upcomingDates.length > 0 ? (
                upcomingDates.map((date) => (
                  <ImportantDateRow key={date.id} date={date} />
                ))
              ) : (
                <EmptyState
                  icon="calendar-outline"
                  title="No important dates yet"
                  body="Closing day, inspection deadlines, and other key dates will appear here."
                />
              )}
            </View>
          </>
        ) : (
          <EmptyState
            icon="home-outline"
            title="No active search yet"
            body="Your realtor will get you set up soon. Once they do, you'll see your deal progress here."
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  firmName: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  loader: {
    marginTop: 40,
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
