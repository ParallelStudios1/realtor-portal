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
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
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

  // Confirm the client's proposed home (or set this as the agreed home). Routed
  // through the deal-id agree-house API: staff confirm agrees the home, clears
  // the proposal, and auto-advances the deal to awaiting_offer.
  const confirmHome = async () => {
    setWorking(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const apiBase = (
        (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
        'https://realtor-portal-ten.vercel.app'
      ).replace(/\/$/, '');
      const r = await fetch(`${apiBase}/api/deals/${house.search_id}/agree-house`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ house_id: house.id }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) throw new Error(json?.error || `Failed (HTTP ${r.status}).`);
      await refetch();
      Alert.alert('Confirmed', 'Home locked in — the deal moved to Awaiting offer.');
    } catch (e: any) {
      Alert.alert('Could not confirm', e.message ?? String(e));
    } finally {
      setWorking(false);
    }
  };

  const clientProposedThis =
    (search as any)?.house_proposed_house_id === house.id &&
    !(search as any)?.house_agreed_at;
  const isAgreedHome =
    (search as any)?.offer_house_id === house.id &&
    !!(search as any)?.house_agreed_at;

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
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {house.photo_url ? (
          <Image source={{ uri: house.photo_url }} style={styles.photo} contentFit="cover" />
        ) : (
          <View style={[styles.photoPlaceholder, { backgroundColor: colors.surface }]}>
            <Ionicons name="home-outline" size={40} color={colors.textSecondary} />
          </View>
        )}

        <View style={styles.body}>
          <Text style={[styles.address, { color: colors.text }]}>{house.address}</Text>

          {clientProposedThis && (
            <View style={styles.confirmBanner}>
              <Text style={styles.confirmTitle}>Client picked this home</Text>
              <Text style={styles.confirmBody}>
                Your client wants this house. Confirm to lock it in and move the
                deal to Awaiting offer.
              </Text>
              <Pressable
                onPress={confirmHome}
                disabled={working}
                style={[styles.confirmBtn, working && { opacity: 0.6 }]}
              >
                <Text style={styles.confirmBtnText}>
                  {working ? 'Confirming…' : 'Confirm this home'}
                </Text>
              </Pressable>
            </View>
          )}
          {isAgreedHome && (
            <View style={styles.agreedBanner}>
              <Text style={styles.agreedText}>✓ Agreed home for this deal</Text>
            </View>
          )}

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
  confirmBanner: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: '#FBBF24',
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 14,
  },
  confirmTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#B45309',
  },
  confirmBody: { marginTop: 4, fontSize: 14, color: '#92400E', lineHeight: 20 },
  confirmBtn: {
    marginTop: 12,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  agreedBanner: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 12,
  },
  agreedText: { color: '#047857', fontWeight: '700', fontSize: 14 },
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
