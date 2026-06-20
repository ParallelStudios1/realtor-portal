import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useClientSearches, useHouses } from '@/lib/queries';
import { useUpdateFavoriteHouse } from '@/lib/mutations';
import { formatPrice } from '@/lib/format';
import { formatHouseStatus } from '@/lib/houseStatus';
import { listingStatusLabel } from '@/lib/dealKind';
import { SkeletonRow } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Ionicons } from '@expo/vector-icons';

export default function HousesScreen() {
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();

  const { data: searches, isLoading: searchesLoading, refetch: refetchSearches } = useClientSearches(
    userProfile?.firm_id,
    false,
    user?.id
  );

  const activeSearch = searches?.[0];
  const isSeller = (activeSearch as any)?.kind === 'seller';
  const { data: houses, isLoading: housesLoading, refetch: refetchHouses } = useHouses(activeSearch?.id);

  const updateFavorite = useUpdateFavoriteHouse();

  const onRefresh = async () => {
    await Promise.all([refetchSearches(), refetchHouses()]);
  };

  const handleToggleFavorite = (houseId: string, currentFav: boolean) => {
    updateFavorite.mutate({
      houseId,
      isFavorite: !currentFav,
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={searchesLoading || housesLoading}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {searches === undefined || (activeSearch && houses === undefined) ? (
          <View>
            <SkeletonRow withChip />
            <SkeletonRow withChip />
            <SkeletonRow withChip />
            <SkeletonRow withChip />
          </View>
        ) : !activeSearch ? (
          <EmptyState
            icon="home-outline"
            title="No active search yet"
            body="Once your realtor sets up your search, properties will appear here."
          />
        ) : houses && houses.length > 0 ? (
          <View>
            {houses.map((house) => (
              <TouchableOpacity
                key={house.id}
                onPress={() => router.push(`/(client)/houses/${house.id}` as any)}
                style={[
                  styles.houseCard,
                  { borderBottomColor: colors.border },
                ]}
              >
                <View style={styles.houseContent}>
                  <Text
                    style={[styles.address, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {house.address}
                  </Text>
                  {house.list_price && (
                    <Text style={[styles.price, { color: colors.primary }]}>
                      {formatPrice(house.list_price)}
                    </Text>
                  )}
                  {(house.bedrooms || house.bathrooms || house.square_feet) && (
                    <Text style={[styles.details, { color: colors.textSecondary }]}>
                      {house.bedrooms && `${house.bedrooms} bed`}
                      {house.bathrooms && ` • ${house.bathrooms} bath`}
                      {house.square_feet && ` • ${house.square_feet.toLocaleString()} sqft`}
                    </Text>
                  )}
                  <Text
                    style={[
                      styles.statusPill,
                      { color: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    {isSeller
                      ? listingStatusLabel((house as any).listing_status)
                      : formatHouseStatus(house.status)}
                  </Text>
                </View>
                {/* Favoriting is a buyer action - sellers don't favorite
                    their own listings. */}
                {!isSeller && (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      handleToggleFavorite(house.id, house.is_favorite);
                    }}
                    style={styles.favoriteButton}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={house.is_favorite ? 'heart' : 'heart-outline'}
                      size={22}
                      color={house.is_favorite ? colors.primary : colors.textSecondary}
                    />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="home-outline"
            title={isSeller ? 'No listings yet' : 'No houses yet'}
            body={
              isSeller
                ? "Your listing will show up here once it's added - you or your agent can add it from the web portal."
                : "Your realtor will add properties to your search soon. They'll show up here."
            }
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
  loader: {
    marginTop: 40,
  },
  houseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  houseContent: {
    flex: 1,
  },
  address: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  details: {
    fontSize: 12,
  },
  statusPill: {
    fontSize: 10,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 6,
    overflow: 'hidden',
  },
  favoriteButton: {
    padding: 8,
    marginLeft: 8,
  },
  favoriteIcon: {
    fontSize: 20,
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
