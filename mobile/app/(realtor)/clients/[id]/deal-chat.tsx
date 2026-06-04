import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { DealChat } from '@/components/DealChat';

/**
 * Realtor-side deal group chat. Whole-deal thread (every party) backed by the
 * deployed /api/deals/{searchId}/chat endpoints via the reusable DealChat
 * component. Reached from the deal detail's "Deal chat" quick action.
 */
export default function RealtorDealChatScreen() {
  const { id: searchId } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Deal chat
        </Text>
        <View style={{ width: 28 }} />
      </View>
      <DealChat searchId={searchId} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
});
