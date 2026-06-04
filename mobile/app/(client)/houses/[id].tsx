import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Pressable,
  ActivityIndicator,
  Linking,
  TextInput,
  Platform,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useHouse, useHouseRating, useSearch } from '@/lib/queries';
import {
  useRequestTour,
  useSubmitRating,
  useLogActivity,
} from '@/lib/mutations';
import { formatHouseStatus } from '@/lib/houseStatus';
import { Stars } from '@/components/Stars';
import type { HouseStatus } from '@/lib/database.types';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

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
  const toast = useToast();

  const queryClient = useQueryClient();
  const { data: house, isLoading, refetch } = useHouse(id);
  const { data: rating } = useHouseRating(id, user?.id);
  const { data: search, refetch: refetchSearch } = useSearch(
    house?.search_id,
  );

  const requestTour = useRequestTour();
  const submitRating = useSubmitRating();
  const logActivity = useLogActivity();

  const [agreeing, setAgreeing] = useState(false);
  const [tourNotes, setTourNotes] = useState('');
  const [tourWhenDate, setTourWhenDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
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
        preferredWhen: tourWhenDate ? tourWhenDate.toISOString() : undefined,
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
      toast.show('Tour requested — your realtor will confirm timing.', {
        variant: 'success',
      });
      setTourNotes('');
      // BUG FIX: was `setTourWhen('')` which crashed (no such setter) and the
      // catch below fired a misleading 'preferred_when ... doesn't exist'
      // toast even though the row was already in the DB. The actual state
      // setter is setTourWhenDate(Date | null).
      setTourWhenDate(null);
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setRequesting(false);
    }
  };

  const handleSubmitRating = async () => {
    if (stars < 1) {
      toast.show('Pick at least 1 star.', { variant: 'error' });
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
      toast.show('Thanks — your realtor will see your feedback.', {
        variant: 'success',
      });
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const isAgreedHome =
    !!(search as any)?.offer_house_id &&
    (search as any).offer_house_id === house.id &&
    !!(search as any)?.house_agreed_at;

  const handleAgreeHouse = async () => {
    setAgreeing(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const apiBase = (
        (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
        'https://realtor-portal-ten.vercel.app'
      ).replace(/\/$/, '');
      const r = await fetch(
        `${apiBase}/api/deals/${house.search_id}/agree-house`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ house_id: house.id }),
        },
      );
      const raw = await r.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {}
      if (!r.ok || !json?.ok) {
        throw new Error(json?.error || `Failed (HTTP ${r.status}).`);
      }
      // Refresh the deal so the agreed-home card appears on the home screen.
      queryClient.invalidateQueries({ queryKey: ['search', house.search_id] });
      queryClient.invalidateQueries({ queryKey: ['clientSearches'] });
      queryClient.invalidateQueries({ queryKey: ['activities', house.search_id] });
      await refetchSearch();
      toast.show('This is the home — your agent has been notified.', {
        variant: 'success',
      });
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setAgreeing(false);
    }
  };

  const showRatingUI = house.status === 'toured';

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

          {/* "This is the house I want" — confirms the agreed home for the
              whole deal via /api/deals/{searchId}/agree-house. */}
          {isAgreedHome ? (
            <View
              style={[
                styles.actionBlock,
                {
                  borderColor: colors.success,
                  backgroundColor: colors.success + '12',
                  alignItems: 'center',
                },
              ]}
            >
              <Text
                style={{
                  color: colors.success,
                  fontWeight: '700',
                  fontSize: 15,
                  textAlign: 'center',
                }}
              >
                ✓ This is your agreed home
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 13,
                  marginTop: 4,
                  textAlign: 'center',
                }}
              >
                Your agent has this marked as the home for your deal.
              </Text>
            </View>
          ) : (
            <View style={[styles.actionBlock, { borderColor: colors.border }]}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>
                Found the one?
              </Text>
              <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                Let your agent know this is the home you want to move on.
              </Text>
              <Pressable
                onPress={handleAgreeHouse}
                disabled={agreeing}
                style={[styles.primaryBtn, { backgroundColor: colors.success }]}
              >
                {agreeing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    This is the house I want
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          {/* Status-driven primary action */}
          {house.status === 'interested' && (
            <View style={[styles.actionBlock, { borderColor: colors.border }]}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Want to see this house?</Text>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    paddingVertical: 14,
                  },
                ]}
              >
                <Text
                  style={{
                    color: tourWhenDate ? colors.text : colors.textSecondary,
                    fontSize: 14,
                  }}
                >
                  {tourWhenDate
                    ? tourWhenDate.toLocaleString([], {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : 'Pick a date & time'}
                </Text>
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={tourWhenDate || new Date()}
                  mode="datetime"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={(e: DateTimePickerEvent, d?: Date) => {
                    if (Platform.OS !== 'ios') setShowDatePicker(false);
                    if (e.type === 'set' && d) setTourWhenDate(d);
                  }}
                  minimumDate={new Date()}
                />
              )}
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
  helpText: { fontSize: 13, marginTop: 8, marginBottom: 4 },
  input: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, marginTop: 12,
  },
  primaryBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  tourPending: { fontSize: 14, fontWeight: '500', textAlign: 'center', paddingVertical: 8 },
  savedNotes: { fontSize: 13, fontStyle: 'italic', marginTop: 12, textAlign: 'center' },
});
