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
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useHouse, useHouseRating } from '@/lib/queries';
import {
  useRequestTour,
  useSubmitRating,
  useLogActivity,
} from '@/lib/mutations';
import { formatHouseStatus } from '@/lib/houseStatus';
import { Stars } from '@/components/Stars';
import type { HouseStatus } from '@/lib/database.types';

/**
 * House detail (client side).
 *
 * Shows photo, address, price, beds/baths/sqft, status pill, and a
 * role-appropriate primary action:
 *   - status='interested'      → "Request a Tour"
 *   - status='tour_requested'  → "Tour Requested ✓" (disabled)
 *   - status='toured', no rating → "How was the tour? ★ ☆ ☆ ☆ ☆" inline rating UI
 *   - status='toured', rated   → show the rating they gave
 *
 * "View on Zillow" deep-links out if listing_url exists.
 */
export default function ClientHouseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();

  const { data: house, isLoading, refetch } = useHouse(id);
  const { data: rating } = useHouseRating(id, user?.id);

  const requestTour = useRequestTour();
  const submitRating = useSubmitRating();
  const logActivity = useLogActivity();

  const [tourNotes, setTourNotes] = useState('');
  const [tourWhen, setTourWhen] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [stars, setStars] = useState(rating?.stars ?? 0);
  const [ratingNotes, setRatingNotes] = useState(rating?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);

  if (isLoading || !house) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const handleRequestTour = async () => {
    if (!user?.id || !userProfile?.firm_id) return;
    setRequesting(true);
    try {
      await requestTour.mutateAsync({
        houseId: house.id,
        searchId: house.search_id,
        firmId: userProfile.firm_id,
        clientId: user.id,
        preferredWhen: tourWhen.trim() || undefined,
        notes: tourNotes.trim() || undefined,
      });
      await logActivity.mutateAsync({
        searchId: house.search_id,
        firmId: userProfile.firm_id,
        actorId: user.id,
        action: 'requested',
        target: `Tour of ${house.address}`,
      });
      await refetch();
      Alert.alert('Tour requested', 'Your realtor will reach out to confirm timing.');
      setTourNotes('');
      setTourWhen('');
    } catch (e: any) {
      Alert.alert('Could not request tour', e.message ?? String(e));
    } finally {
      setRequesting(false);
    }
  };

  const handleSubmitRating = async () => {
    if (stars < 1) {
      Alert.alert('Pick at least 1 star');
      return;
    }
    if (!user?.id || !userProfile?.firm_id) return;
    setSubmitting(true);
    try {
      await submitRating.mutateAsync({
        houseId: house.id,
        searchId: house.search_id,
        firmId: userProfile.firm_id,
        clientId: user.id,
        stars,
        notes: ratingNotes.trim() || undefined,
      });
      await logActivity.mutateAsync({
        searchId: house.search_id,
        firmId: userProfile.firm_id,
        actorId: user.id,
        action: 'rated',
        target: house.address,
        metadata: { stars },
      });
      await refetch();
      Alert.alert('Thanks!', 'Your realtor will see your feedback.');
    } catch (e: any) {
      Alert.alert('Could not save rating', e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const showRatingUI = house.status === 'toured';

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

          <View style={styles.statusRow}>
            <StatusChip status={house.status} />
            {house.is_favorite && (
              <Text style={[styles.fav, { color: colors.warning }]}>★ Favorite</Text>
            )}
          </View>

          <View style={styles.specs}>
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
          </View>

          {house.notes ? (
            <View style={[styles.notesBlock, { borderColor: colors.border }]}>
              <Text style={[styles.notesText, { color: colors.text }]}>{house.notes}</Text>
            </View>
          ) : null}

          {house.listing_url ? (
            <Pressable
              onPress={() => Linking.openURL(house.listing_url!)}
              style={[styles.linkBtn, { borderColor: colors.primary }]}
            >
              <Text style={[styles.linkBtnText, { color: colors.primary }]}>
                View Original Listing →
              </Text>
            </Pressable>
          ) : null}

          {/* Status-driven primary action */}
          {house.status === 'interested' && (
            <View style={[styles.actionBlock, { borderColor: colors.border }]}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Want to see this house?</Text>
              <TextInput
                value={tourWhen}
                onChangeText={setTourWhen}
                placeholder="Preferred when (e.g. Saturday afternoon)"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />
              <TextInput
                value={tourNotes}
                onChangeText={setTourNotes}
                placeholder="Anything else your realtor should know? (optional)"
                placeholderTextColor={colors.textSecondary}
                multiline
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.border, minHeight: 70 },
                ]}
              />
              <Pressable
                onPress={handleRequestTour}
                disabled={requesting}
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              >
                {requesting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Request a Tour</Text>
                )}
              </Pressable>
            </View>
          )}

          {house.status === 'tour_requested' && (
            <View style={[styles.actionBlock, { borderColor: colors.border, alignItems: 'center' }]}>
              <Text style={[styles.tourPending, { color: colors.text }]}>
                ✓ Tour requested — your realtor will be in touch
              </Text>
            </View>
          )}

          {showRatingUI && (
            <View style={[styles.actionBlock, { borderColor: colors.border }]}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>
                {rating ? 'Your rating' : 'How was the tour?'}
              </Text>
              <View style={{ alignItems: 'center', marginTop: 12 }}>
                <Stars
                  value={stars}
                  onChange={rating ? undefined : setStars}
                  size={36}
                />
              </View>
              {!rating && (
                <>
                  <TextInput
                    value={ratingNotes}
                    onChangeText={setRatingNotes}
                    placeholder="What did you think? (optional)"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    style={[
                      styles.input,
                      { color: colors.text, borderColor: colors.border, minHeight: 80, marginTop: 12 },
                    ]}
                  />
                  <Pressable
                    onPress={handleSubmitRating}
                    disabled={submitting}
                    style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Send Feedback</Text>
                    )}
                  </Pressable>
                </>
              )}
              {rating?.notes ? (
                <Text style={[styles.savedNotes, { color: colors.textSecondary }]}>
                  "{rating.notes}"
                </Text>
              ) : null}
            </View>
          )}

          <View style={{ height: 32 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusChip({ status }: { status: HouseStatus }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.chip, { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}>
      <Text style={[styles.chipText, { color: colors.primary }]}>{formatHouseStatus(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  photo: { width: '100%', height: 220 },
  photoPlaceholder: { width: '100%', height: 220, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20 },
  address: { fontSize: 22, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600' },
  fav: { fontSize: 13, fontWeight: '500' },
  specs: { marginTop: 16 },
  price: { fontSize: 20, fontWeight: '700' },
  specRow: { fontSize: 13, marginTop: 4 },
  notesBlock: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 16 },
  notesText: { fontSize: 14, lineHeight: 20 },
  linkBtn: { borderWidth: 1, padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  linkBtnText: { fontSize: 14, fontWeight: '600' },
  actionBlock: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 24 },
  actionTitle: { fontSize: 16, fontWeight: '600' },
  input: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, marginTop: 12,
  },
  primaryBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  tourPending: { fontSize: 14, fontWeight: '500', textAlign: 'center', paddingVertical: 8 },
  savedNotes: { fontSize: 13, fontStyle: 'italic', marginTop: 12, textAlign: 'center' },
});
