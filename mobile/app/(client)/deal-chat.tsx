import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useClientSearches } from '@/lib/queries';
import { DealChat } from '@/components/DealChat';
import { EmptyState } from '@/components/EmptyState';

/**
 * Client-side deal group chat. Same whole-deal thread the realtor sees, backed
 * by /api/deals/{searchId}/chat through the reusable DealChat component.
 * Reached from the client home's "Deal chat" quick link. Resolves the client's
 * active search the same way the Messages tab does.
 */
export default function ClientDealChatScreen() {
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();

  const { data: searches, isLoading } = useClientSearches(
    userProfile?.firm_id,
    false,
    user?.id,
  );
  const activeSearch = searches?.[0];

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!activeSearch) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="chatbubbles-outline"
          title="No active deal yet"
          body="Once your realtor sets you up, the deal chat opens here."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <DealChat searchId={activeSearch.id} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
