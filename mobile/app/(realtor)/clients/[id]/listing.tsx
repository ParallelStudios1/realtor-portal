import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useHouses, useListingOffers } from '@/lib/queries';
import { LISTING_STATUSES, listingStatusLabel } from '@/lib/dealKind';
import {
  OFFER_STATUSES,
  offerStatusLabel,
  useUpdateListing,
  useAddOffer,
  useUpdateOfferStatus,
  useDeleteOffer,
} from '@/lib/dealActions';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

/**
 * Seller-deal listing management - mobile mirror of the web
 * SellerListingPanel: edit listing status / list price / MLS number, log
 * offers received, and update or delete them. Phase auto-advance
 * (active → Awaiting offer, offer → Offer received, accepted → Under
 * contract, sold → Closed) happens in the database automatically.
 */

function money(n: number | null | undefined) {
  return n == null ? '-' : '$' + Number(n).toLocaleString();
}

const OFFER_TONE: Record<string, string> = {
  received: '#2563EB',
  countered: '#D97706',
  accepted: '#059669',
  rejected: '#E11D48',
  withdrawn: '#9CA3AF',
};

const FINANCING = ['cash', 'conventional', 'fha', 'va', 'other'];

export default function ListingScreen() {
  const { id: searchId } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();

  const { data: houses, isLoading, refetch: refetchHouses } = useHouses(searchId);
  const { data: offers, refetch: refetchOffers } = useListingOffers(searchId);
  const updateListing = useUpdateListing();
  const addOffer = useAddOffer();
  const updateOfferStatus = useUpdateOfferStatus();
  const deleteOffer = useDeleteOffer();

  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [mlsDrafts, setMlsDrafts] = useState<Record<string, string>>({});
  const [busyHouse, setBusyHouse] = useState<string | null>(null);
  const [busyOffer, setBusyOffer] = useState<string | null>(null);

  // Add-offer form
  const [adding, setAdding] = useState(false);
  const [offerHouseId, setOfferHouseId] = useState('');
  const [amount, setAmount] = useState('');
  const [emd, setEmd] = useState('');
  const [buyer, setBuyer] = useState('');
  const [agent, setAgent] = useState('');
  const [financing, setFinancing] = useState('conventional');

  const patchListing = async (
    houseId: string,
    patch: Parameters<typeof updateListing.mutateAsync>[0]['patch']
  ) => {
    if (!searchId) return;
    setBusyHouse(houseId);
    try {
      await updateListing.mutateAsync({ searchId, houseId, patch });
      await refetchHouses();
      toast.show('Listing updated.', { variant: 'success' });
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setBusyHouse(null);
    }
  };

  const submitOffer = async () => {
    if (!searchId) return;
    if (!amount || !Number(amount)) {
      toast.show('Enter the offer amount.', { variant: 'error' });
      return;
    }
    try {
      await addOffer.mutateAsync({
        searchId,
        houseId: offerHouseId || (houses ?? [])[0]?.id || null,
        buyerName: buyer.trim() || null,
        buyerAgent: agent.trim() || null,
        amount: Number(amount),
        earnestMoney: emd ? Number(emd) : null,
        financing,
      });
      setAdding(false);
      setAmount('');
      setEmd('');
      setBuyer('');
      setAgent('');
      await refetchOffers();
      toast.show('Offer logged.', { variant: 'success' });
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    }
  };

  const setOfferStatus = async (offerId: string, status: string) => {
    if (!searchId) return;
    setBusyOffer(offerId);
    try {
      await updateOfferStatus.mutateAsync({ searchId, offerId, status });
      await refetchOffers();
      if (status === 'accepted') {
        toast.show('Offer accepted - deal moved to Under contract.', {
          variant: 'success',
        });
      } else {
        toast.show('Offer marked ' + offerStatusLabel(status).toLowerCase() + '.', {
          variant: 'success',
        });
      }
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setBusyOffer(null);
    }
  };

  const removeOffer = (offerId: string) => {
    Alert.alert('Delete this offer?', 'This removes it from the deal history.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!searchId) return;
          setBusyOffer(offerId);
          try {
            await deleteOffer.mutateAsync({ searchId, offerId });
            await refetchOffers();
          } catch (e: any) {
            toast.show(humanError(e), { variant: 'error' });
          } finally {
            setBusyOffer(null);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.text }]}>
          Listing and offers
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (houses ?? []).length === 0 ? (
          <Text style={{ color: colors.textSecondary, paddingTop: 24, textAlign: 'center' }}>
            No listing yet. Add the property you're selling from the deal screen.
          </Text>
        ) : (
          (houses ?? []).map((h: any) => {
            const status = h.listing_status || 'active';
            return (
              <View
                key={h.id}
                style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
                  {h.address || 'Listing'}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  List {money(h.list_price)}
                  {h.mls_number ? ' · MLS ' + h.mls_number : ''}
                  {status === 'sold' && h.sold_price ? ' · Sold ' + money(h.sold_price) : ''}
                </Text>

                <Text style={[s.label, { color: colors.textSecondary }]}>STATUS</Text>
                <View style={s.chipRow}>
                  {LISTING_STATUSES.map((st) => {
                    const active = status === st.id;
                    return (
                      <Pressable
                        key={st.id}
                        disabled={busyHouse === h.id}
                        onPress={() => {
                          if (st.id === status) return;
                          patchListing(h.id, { listing_status: st.id });
                        }}
                        style={[
                          s.chip,
                          {
                            borderColor: active ? colors.primary : colors.border,
                            backgroundColor: active ? colors.primary + '14' : 'transparent',
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: active ? colors.primary : colors.text,
                          }}
                        >
                          {st.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.label, { color: colors.textSecondary }]}>LIST PRICE</Text>
                    <TextInput
                      defaultValue={h.list_price != null ? String(h.list_price) : ''}
                      onChangeText={(v) => setPriceDrafts((d) => ({ ...d, [h.id]: v }))}
                      onBlur={() => {
                        const v = priceDrafts[h.id];
                        if (v === undefined) return;
                        patchListing(h.id, { list_price: v ? Number(v) : null });
                      }}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textSecondary + '88'}
                      style={[s.input, { color: colors.text, borderColor: colors.border }]}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.label, { color: colors.textSecondary }]}>MLS #</Text>
                    <TextInput
                      defaultValue={h.mls_number || ''}
                      onChangeText={(v) => setMlsDrafts((d) => ({ ...d, [h.id]: v }))}
                      onBlur={() => {
                        const v = mlsDrafts[h.id];
                        if (v === undefined) return;
                        patchListing(h.id, { mls_number: v.trim() || null });
                      }}
                      autoCapitalize="characters"
                      placeholder="e.g. 7412233"
                      placeholderTextColor={colors.textSecondary + '88'}
                      style={[s.input, { color: colors.text, borderColor: colors.border }]}
                    />
                  </View>
                </View>

                {busyHouse === h.id && (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
                )}
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 8 }}>
                  Status changes move the deal automatically - Active opens
                  Awaiting offer, Sold closes the deal.
                </Text>
              </View>
            );
          })
        )}

        {/* Offers */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 18,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>
            OFFERS RECEIVED ({(offers ?? []).length})
          </Text>
          <Pressable onPress={() => setAdding((v) => !v)} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>
              {adding ? 'Cancel' : '+ Log an offer'}
            </Text>
          </Pressable>
        </View>

        {adding && (
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(houses ?? []).length > 1 && (
              <>
                <Text style={[s.label, { color: colors.textSecondary }]}>LISTING</Text>
                <View style={s.chipRow}>
                  {(houses ?? []).map((h: any) => {
                    const active = (offerHouseId || (houses ?? [])[0]?.id) === h.id;
                    return (
                      <Pressable
                        key={h.id}
                        onPress={() => setOfferHouseId(h.id)}
                        style={[
                          s.chip,
                          {
                            borderColor: active ? colors.primary : colors.border,
                            backgroundColor: active ? colors.primary + '14' : 'transparent',
                          },
                        ]}
                      >
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: 12,
                            fontWeight: '600',
                            maxWidth: 180,
                            color: active ? colors.primary : colors.text,
                          }}
                        >
                          {h.address || 'Home'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: colors.textSecondary }]}>OFFER AMOUNT</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary + '88'}
                  style={[s.input, { color: colors.text, borderColor: colors.border }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: colors.textSecondary }]}>EARNEST MONEY</Text>
                <TextInput
                  value={emd}
                  onChangeText={setEmd}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary + '88'}
                  style={[s.input, { color: colors.text, borderColor: colors.border }]}
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: colors.textSecondary }]}>BUYER NAME</Text>
                <TextInput
                  value={buyer}
                  onChangeText={setBuyer}
                  placeholder="Buyer"
                  placeholderTextColor={colors.textSecondary + '88'}
                  style={[s.input, { color: colors.text, borderColor: colors.border }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: colors.textSecondary }]}>BUYER'S AGENT</Text>
                <TextInput
                  value={agent}
                  onChangeText={setAgent}
                  placeholder="Agent"
                  placeholderTextColor={colors.textSecondary + '88'}
                  style={[s.input, { color: colors.text, borderColor: colors.border }]}
                />
              </View>
            </View>
            <Text style={[s.label, { color: colors.textSecondary }]}>FINANCING</Text>
            <View style={s.chipRow}>
              {FINANCING.map((f) => {
                const active = financing === f;
                return (
                  <Pressable
                    key={f}
                    onPress={() => setFinancing(f)}
                    style={[
                      s.chip,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary + '14' : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        textTransform: 'capitalize',
                        color: active ? colors.primary : colors.text,
                      }}
                    >
                      {f === 'fha' ? 'FHA' : f === 'va' ? 'VA' : f}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              onPress={submitOffer}
              disabled={addOffer.isPending || !amount}
              style={[
                s.btn,
                {
                  backgroundColor: colors.primary,
                  marginTop: 14,
                  opacity: addOffer.isPending || !amount ? 0.55 : 1,
                },
              ]}
            >
              {addOffer.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '700' }}>Log offer</Text>
              )}
            </Pressable>
          </View>
        )}

        {(offers ?? []).length === 0 && !adding ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' }}>
            No offers logged yet. When a buyer's agent sends an offer, log it
            here to compare and respond.
          </Text>
        ) : (
          (offers ?? []).map((o: any) => {
            const tone = OFFER_TONE[o.status] || colors.textSecondary;
            return (
              <View
                key={o.id}
                style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
                    {money(o.amount)}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[s.statusChip, { borderColor: tone }]}>
                      <Text style={{ color: tone, fontSize: 10, fontWeight: '700' }}>
                        {offerStatusLabel(o.status).toUpperCase()}
                      </Text>
                    </View>
                    <Pressable onPress={() => removeOffer(o.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {o.buyer_name || 'Buyer'}
                  {o.buyer_agent ? ' · agent ' + o.buyer_agent : ''}
                  {o.financing ? ' · ' + o.financing : ''}
                  {o.earnest_money != null ? ' · EMD ' + money(o.earnest_money) : ''}
                </Text>

                {busyOffer === o.id ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
                ) : (
                  <View style={[s.chipRow, { marginTop: 10 }]}>
                    {OFFER_STATUSES.filter((st) => st.id !== o.status).map((st) => (
                      <Pressable
                        key={st.id}
                        onPress={() => setOfferStatus(o.id, st.id)}
                        style={[s.chip, { borderColor: colors.border }]}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>
                          {st.id === 'accepted' ? 'Accept' : st.id === 'rejected' ? 'Reject' : st.id === 'countered' ? 'Counter' : st.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 10,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  btn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
