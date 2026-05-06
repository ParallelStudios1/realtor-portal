import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useHouse, useSearch, useHouseRating } from '@/lib/queries';
import {
  useUpdateHouseStatus,
  useLogActivity,
} from '@/lib/mutations';
import { formatHouseStatus, HOUSE_STATUSES } from '@/lib/houseStatus';
import { Stars } from '@/components/Stars';
import type { HouseStatus } from '@/lib/database.types';

/**
 * House detail (realtor side).
 *
 * Realtor can:
 *   - Change status (interested → tour_requested → toured → offered/passed)
 *   - When status flips to 'toured': a "Request Feedback" button shows.
 *     Tapping it logs an activity → client gets a push notification → client
 *     opens their version of this screen and sees the rating prompt.
 *   - Read the rating once submitted.
 */
export default function RealtorHouseDetailScreen() {
  const { id: searchId, houseId } = useLocalSearchParams<{ id: string; houseId: string }>();
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();

  const { data: house, isLoading, refetch } = useHouse(houseId);
  const { data: search } = useSearch(searchId);
  const { data: rating } = useHouseRating(houseId, search?.client_id);

  const updateStatus = useUpdateHouseStatus();
  const logActivity = useLogActivity();

  const [working, setWorking] = useState(false);

  if (isLoading || !house || !search) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const setStatus = async (next: HouseStatus) => {
    if (next === house.status) return;
    if (!userProfile?.firm_id || !user?.id) return;
    setWorking(true);
    try {
      await updateStatus.mutateAsync({ houseId: house.id, status: next });
      await logActivity.mutateAsync({
        searchId: house.search_id,
        firmId: userProfile.firm_id,
        actorId: user.id,
        action: 'updated',
        target: `${house.address} status`,
        metadata: { from: house.status, to: next },
      });
      await refetch();
    } catch (e: any) {
      Alert.alert('Could not update status', e.message ?? String(e));
    } finally {
      setWorking(false);
    }
  };

  const requestFeedback = async () => {
    if (!userProfile?.firm_id || !user?.id) return;
    setWorking(true);
    try {
      // Just log an activity. The client UI shows a rating prompt whenever
      // house.status === 'toured' and there's no rating yet — no DB placeholder
      // needed. Activity row is what drives the push notification.
      await logActivity.mutateAsync({
        searchId: house.search_id,
        firmId: userProfile.firm_id,
        actorId: user.id,
        action: 'requested feedback on',
        target: house.address,
      });
      Alert.alert('Sent', 'Your client got a notification asking for feedback.');
    } catch (e: any) {
      Alert.alert('Could not send', e.message ?? String(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView>
        {house.photo_url ? (
          <Image source={{ uri: house.photo_url }} style={styles.photo} contentFit="cover" />
        ) : (
          <View style={[styles.photoPlaceholder, { backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 40 }}>🏠</Text>
          </View>
        )}

        <View style={styles.body}>
          <Text style={[styles.address, { color: colors.text }]}>{house.address}</Text>

          {house.list_price ? (
            <Text style={[styles.price, { color: colors.text }]}>
              ${Number(house.list_price).toLocaleString()}
            </Text>
          ) : null}
          <Text style={[styles.specRow, { color: colors.textSecondary }]}>
            {[
              house.bedrooms ? `${house.bedrooms} bed` : null,
              house.bathrooms ? `${house.bathrooms} bath` : null,
              house.square_feet ? `${house.square_feet.toLocaleString()} sqft` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>

          {house.listing_url ? (
            <Pressable
              onPress={() => Linking.openURL(house.listing_url!)}
              style={[styles.linkBtn, { borderColor: colors.primary }]}
            >
              <Text style={[styles.linkBtnText, { color: colors.primary }]}>
                Open Listing →
              </Text>
            </Pressable>
          ) : null}

          {/* Status changer */}
          <View style={[styles.actionBlock, { borderColor: colors.border }]}>
            <Text style={[styles.actionTitle, { color: colors.text }]}>Status</Text>
            <View style={styles.chipRow}>
              {HOUSE_STATUSES.map((s) => {
                const active = s === house.status;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setStatus(s)}
                    disabled={working}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? colors.primary : 'transparent',
                        borderColor: colors.primary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? '#fff' : colors.primary },
                      ]}
                    >
                      {formatHouseStatus(s)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* If toured, allow feedback request */}
          {house.status === 'toured' && (
            <View style={[styles.actionBlock, { borderColor: colors.border }]}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Tour Feedback</Text>
              {rating && rating.stars >= 1 ? (
                <View style={{ marginTop: 12 }}>
                  <Stars value={rating.stars} size={28} />
                  {rating.notes ? (
                    <Text style={[styles.notesText, { color: colors.text, marginTop: 12 }]}>
                      "{rating.notes}"
                    </Text>
                  ) : (
                    <Text style={[styles.notesText, { color: colors.textSecondary, marginTop: 12 }]}>
                      No notes from the client.
                    </Text>
                  )}
                </View>
              ) : (
                <>
                  <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                    Send your client a notification asking for a 1–5 rating on this house.
                  </Text>
                  <Pressable
                    onPress={requestFeedback}
                    disabled={working}
                    style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                  >
                    {working ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Request Feedback</Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          )}

          <View style={{ height: 32 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  photo: { width: '100%', height: 220 },
  photoPlaceholder: { width: '100%', height: 220, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20 },
  address: { fontSize: 22, fontWeight: '700' },
  price: { fontSize: 20, fontWeight: '700', marginTop: 12 },
  specRow: { fontSize: 13, marginTop: 4 },
  linkBtn: { borderWidth: 1, padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  linkBtnText: { fontSize: 14, fontWeight: '600' },
  actionBlock: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 24 },
  actionTitle: { fontSize: 16, fontWeight: '600' },
  helpText: { fontSize: 13, marginTop: 8, marginBottom: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600' },
  notesText: { fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
  primaryBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
