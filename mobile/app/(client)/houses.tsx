import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useClientSearches, useHouses } from '@/lib/queries';
import { useUpdateFavoriteHouse } from '@/lib/mutations';
import { formatPrice } from '@/lib/format';
import { formatHouseStatus } from '@/lib/houseStatus';

export default function HousesScreen() {
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();

  const { data: searches, isLoading: searchesLoading, refetch: refetchSearches } = useClientSearches(
    userProfile?.firm_id,
    false,
    user?.id
  );

  const activeSearch = searches?.[0];
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
        {(searchesLoading || housesLoading) && !houses ? (
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
                    {formatHouseStatus(house.status)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    handleToggleFavorite(house.id, house.is_favorite);
                  }}
                  style={styles.favoriteButton}
                  hitSlop={8}
                >
                  <Text style={styles.favoriteIcon}>
                    {house.is_favorite ? '❤️' : '🤍'}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
              No houses added yet. Your realtor will add properties soon.
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
