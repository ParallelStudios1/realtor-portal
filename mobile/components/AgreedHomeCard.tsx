import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';

/**
 * "Agreed home" card. Shown on the realtor deal detail and the client home when
 * the deal has a confirmed home (client_searches.offer_house_id +
 * house_agreed_at). Reads the agreed house's address straight from supabase and
 * resolves who agreed (client vs. realtor vs. staff) from house_agreed_by.
 *
 * `search` is the client_searches row (typed loosely because the agreed-home
 * columns aren't in the base ClientSearch type yet — same `as any` pattern the
 * existing screens use for the newer deal columns).
 */
export function AgreedHomeCard({
  search,
  onPress,
  style,
}: {
  search: any;
  onPress?: () => void;
  style?: any;
}) {
  const { colors } = useTheme();

  const offerHouseId: string | null = search?.offer_house_id ?? null;
  const agreedAt: string | null = search?.house_agreed_at ?? null;
  const agreedBy: string | null = search?.house_agreed_by ?? null;
  const clientId: string | null = search?.client_id ?? null;

  const { data: house } = useQuery({
    queryKey: ['house', offerHouseId],
    queryFn: async () => {
      if (!offerHouseId) return null;
      const { data, error } = await supabase
        .from('houses')
        .select('*')
        .eq('id', offerHouseId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!offerHouseId,
  });

  // Only render once the deal actually has an agreed home.
  if (!offerHouseId || !agreedAt) return null;

  // Seller deals: the "agreed home" IS the listing — label it that way and
  // skip the buyer-flavored "agreed by" line.
  const isSeller = search?.kind === 'seller';

  const whoLabel =
    agreedBy && clientId && agreedBy === clientId
      ? 'the client'
      : agreedBy
        ? 'your agent'
        : 'someone on the deal';

  const Wrapper: any = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: colors.success + '12',
          borderColor: colors.success,
        },
        style,
      ]}
    >
      <View style={styles.headerRow}>
        <Ionicons name="home" size={16} color={colors.success} />
        <Text style={[styles.label, { color: colors.success }]}>
          {isSeller ? 'YOUR LISTING' : 'AGREED HOME'}
        </Text>
      </View>
      <Text style={[styles.address, { color: colors.text }]} numberOfLines={2}>
        {house?.address || (isSeller ? 'Your listing' : 'Confirmed home')}
      </Text>
      {house?.list_price ? (
        <Text style={[styles.price, { color: colors.textSecondary }]}>
          ${Number(house.list_price).toLocaleString()}
        </Text>
      ) : null}
      {!isSeller && (
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          Confirmed by {whoLabel} on {formatDate(agreedAt)}
        </Text>
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  address: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  price: { fontSize: 14, marginTop: 2, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 8 },
});
