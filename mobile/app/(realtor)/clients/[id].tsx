import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import {
  useSearch,
  useHouses,
  useImportantDates,
  useDocuments,
  useActivities,
  useDealParticipants,
  useTourRequests,
  useListingOffers,
  useEsignEnvelopes,
} from '@/lib/queries';
import { useUpdateTourRequest } from '@/lib/mutations';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';
import { apiFetch } from '@/lib/api';
import { ActivityRow } from '@/components/ActivityRow';
import { Skeleton } from '@/components/Skeleton';
import { AgreedHomeCard } from '@/components/AgreedHomeCard';
import {
  FinancialsCard,
  OffersCard,
  SigningLinksCard,
  TourRequestsCard,
} from '@/components/DealInfo';
import { CalendarView, type CalEvent } from '@/components/CalendarView';
import type { DealPhase } from '@/lib/database.types';
import { DEAL_PHASES, phaseLabelShortFor } from '@/lib/dealKind';

const PHASES = DEAL_PHASES as readonly DealPhase[];

/**
 * Realtor's deal detail screen - polished cards + icon-grid quick actions.
 */
export default function RealtorClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userProfile, user } = useAuth();
  const { colors } = useTheme();

  const { data: search, isLoading, refetch: refetchSearch } = useSearch(id);
  const { data: houses, refetch: refetchHouses } = useHouses(id);
  const { data: dates, refetch: refetchDates } = useImportantDates(id);
  const { data: documents, refetch: refetchDocs } = useDocuments(id);
  const { data: activities, refetch: refetchActivities } = useActivities(id);
  const { data: participants, refetch: refetchParticipants } =
    useDealParticipants(id);
  const { data: tours, refetch: refetchTours } = useTourRequests(id);
  const { data: offers, refetch: refetchOffers } = useListingOffers(id);
  const { data: envelopes, refetch: refetchEnvelopes } = useEsignEnvelopes(id);

  const updateTour = useUpdateTourRequest();
  const toast = useToast();
  const [actingTour, setActingTour] = React.useState<string | null>(null);

  const handleTour = async (
    tourRequestId: string,
    status: 'confirmed' | 'declined',
    confirmedWhen?: Date | null
  ) => {
    setActingTour(tourRequestId);
    try {
      await updateTour.mutateAsync({ tourRequestId, status, confirmedWhen });
      await refetchTours();
      toast.show(
        status === 'confirmed' ? 'Tour confirmed.' : 'Tour declined.',
        { variant: 'success' }
      );
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setActingTour(null);
    }
  };

  const [dateBusy, setDateBusy] = React.useState<string | null>(null);
  const toggleDateDone = async (dateId: string, currentlyDone: boolean) => {
    setDateBusy(dateId);
    try {
      await apiFetch('/api/dates/complete', {
        method: 'POST',
        body: { date_id: dateId, done: !currentlyDone },
      });
      await refetchDates();
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setDateBusy(null);
    }
  };

  const calEvents = React.useMemo<CalEvent[]>(() => {
    const out: CalEvent[] = [];
    for (const d of (dates ?? []) as any[]) {
      if (d.date)
        out.push({
          dateStr: String(d.date).slice(0, 10),
          label: d.label || 'Important date',
          kind: 'date',
          time: d.event_time || null,
        });
    }
    for (const t of (tours ?? []) as any[]) {
      const w = t.requested_at || t.preferred_when;
      if (!w) continue;
      const dt = new Date(w);
      if (isNaN(dt.getTime())) continue;
      out.push({
        dateStr: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`,
        label: `Tour: ${t.house?.address || 'home'}`,
        kind: 'tour',
        time: dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
      });
    }
    return out;
  }, [dates, tours]);

  const onRefresh = async () => {
    await Promise.all([
      refetchSearch(),
      refetchHouses(),
      refetchDates(),
      refetchDocs(),
      refetchActivities(),
      refetchParticipants(),
      refetchTours(),
      refetchOffers(),
      refetchEnvelopes(),
    ]);
  };

  if (isLoading || !search) {
    // Skeleton layout that mirrors the real screen so it doesn't feel
    // like a stalled spinner - same header, same action-grid silhouette,
    // same card stack. Animation is in lib/Skeleton.tsx.
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Skeleton width={'60%'} height={22} style={{ marginTop: 8 }} />
          <Skeleton width={'40%'} height={14} style={{ marginTop: 8 }} />
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              marginTop: 16,
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                width={'22%'}
                height={64}
                borderRadius={12}
                style={{ margin: '1.5%' }}
              />
            ))}
          </View>
          {Array.from({ length: 3 }).map((_, i) => (
            <View
              key={i}
              style={{
                marginTop: 16,
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Skeleton width={120} height={12} />
              <Skeleton width={'90%'} height={14} style={{ marginTop: 10 }} />
              <Skeleton width={'70%'} height={14} style={{ marginTop: 6 }} />
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const phaseIdx = PHASES.indexOf(search.phase as DealPhase);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>
            {search.name || 'Deal'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Started {new Date(search.started_at).toLocaleDateString()}
          </Text>
        </View>

        {/* Visual phase stepper */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            DEAL PROGRESS
          </Text>
          <View style={styles.stepperRow}>
            {PHASES.map((p, i) => {
              const done = phaseIdx >= 0 && i <= phaseIdx;
              return (
                <View key={p} style={styles.stepperCell}>
                  <View
                    style={[
                      styles.stepperDot,
                      {
                        backgroundColor: done ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: done ? '#fff' : colors.textSecondary,
                        fontWeight: '700',
                        fontSize: 11,
                      }}
                    >
                      {i + 1}
                    </Text>
                  </View>
                  {i < PHASES.length - 1 && (
                    <View
                      style={[
                        styles.stepperBar,
                        {
                          backgroundColor:
                            done && i < phaseIdx
                              ? colors.primary
                              : colors.border,
                        },
                      ]}
                    />
                  )}
                </View>
              );
            })}
          </View>
          <View style={styles.stepperLabels}>
            {PHASES.map((p, i) => (
              <Text
                key={p}
                style={{
                  flex: 1,
                  fontSize: 9,
                  textAlign: 'center',
                  color:
                    phaseIdx === i ? colors.text : colors.textSecondary,
                  fontWeight: phaseIdx === i ? '700' : '500',
                }}
              >
                {phaseLabelShortFor(p, (search as any)?.kind)}
              </Text>
            ))}
          </View>
        </View>

        {/* Agreed home - shows once a home has been confirmed on the deal. */}
        {(search as any).offer_house_id && (search as any).house_agreed_at ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <AgreedHomeCard
              search={search}
              onPress={() =>
                router.push(
                  `/(realtor)/clients/${id}/houses/${(search as any).offer_house_id}` as any,
                )
              }
            />
          </View>
        ) : null}

        {/* Quick actions grid */}
        <View style={[styles.section, { paddingBottom: 16 }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            QUICK ACTIONS
          </Text>
          <View style={styles.actionGrid}>
            <ActionTile
              tone="#2563EB"
              icon="home"
              label={(search as any)?.kind === 'seller' ? 'Add listing' : 'Add house'}
              onPress={() =>
                router.push(`/(realtor)/clients/${id}/add-house` as any)
              }
            />
            <ActionTile
              tone="#4F46E5"
              icon="flag"
              label="Update phase"
              onPress={() =>
                router.push(`/(realtor)/clients/${id}/phase` as any)
              }
            />
            <ActionTile
              tone="#0F172A"
              icon="document-attach"
              label="Under contract"
              onPress={() =>
                router.push(
                  `/(realtor)/clients/${id}/under-contract` as any,
                )
              }
            />
            <ActionTile
              tone="#059669"
              icon="calendar"
              label="Add date"
              onPress={() =>
                router.push(`/(realtor)/clients/${id}/add-date` as any)
              }
            />
            <ActionTile
              tone="#0891B2"
              icon="walk"
              label="Showings"
              onPress={() =>
                router.push(`/(realtor)/clients/${id}/showings` as any)
              }
            />
            {(search as any)?.kind === 'seller' && (
              <ActionTile
                tone="#16A34A"
                icon="pricetag"
                label="Listing & offers"
                onPress={() =>
                  router.push(`/(realtor)/clients/${id}/listing` as any)
                }
              />
            )}
            <ActionTile
              tone="#D97706"
              icon="cash"
              label="Financials"
              onPress={() =>
                router.push(`/(realtor)/clients/${id}/financials` as any)
              }
            />
            <ActionTile
              tone="#7C3AED"
              icon="document-text"
              label="Upload doc"
              onPress={() =>
                router.push(`/(realtor)/clients/${id}/upload` as any)
              }
            />
            <ActionTile
              tone="#EA580C"
              icon="pencil"
              label="Signing links"
              onPress={() =>
                router.push(`/(realtor)/clients/${id}/docusign` as any)
              }
            />
            <ActionTile
              tone="#475569"
              icon="briefcase"
              label="Attorney"
              onPress={() =>
                router.push(`/(realtor)/clients/${id}/attorney` as any)
              }
            />
            <ActionTile
              tone="#0284C7"
              icon="chatbubble-ellipses"
              label="Deal chat"
              onPress={() =>
                router.push(`/(realtor)/clients/${id}/deal-chat` as any)
              }
            />
            <ActionTile
              tone="#E11D48"
              icon="alert-circle"
              label="Send alert"
              onPress={() =>
                router.push(`/(realtor)/clients/${id}/alert` as any)
              }
            />
            <ActionTile
              tone="#0F766E"
              icon="people"
              label="Add party"
              onPress={() =>
                router.push(`/(realtor)/clients/${id}/add-party` as any)
              }
            />
          </View>
        </View>

        {/* Houses */}
        <SectionCard
          title={(search as any)?.kind === 'seller' ? 'Listings' : 'Houses'}
          count={houses?.length}
          colors={colors}
          actionLabel="+ Add"
          onActionPress={() =>
            router.push(`/(realtor)/clients/${id}/add-house` as any)
          }
        >
          {(houses ?? []).length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No houses yet.
            </Text>
          ) : (
            (houses ?? []).slice(0, 6).map((h: any) => (
              <Pressable
                key={h.id}
                onPress={() =>
                  router.push(
                    `/(realtor)/clients/${id}/houses/${h.id}` as any,
                  )
                }
                style={({ pressed }) => [
                  styles.houseCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                {h.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <View style={styles.housePhoto}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <ExpoImage uri={h.photo_url} />
                  </View>
                ) : (
                  <View
                    style={[
                      styles.housePhoto,
                      { backgroundColor: colors.border },
                    ]}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.houseAddr, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {h.address}
                  </Text>
                  <Text
                    style={[
                      styles.housePrice,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {h.list_price
                      ? '$' + Number(h.list_price).toLocaleString()
                      : 'No price'}
                    {h.bedrooms ? ` · ${h.bedrooms}bd` : ''}
                    {h.bathrooms ? ` · ${h.bathrooms}ba` : ''}
                  </Text>
                </View>
                <View
                  style={[
                    styles.houseStatusChip,
                    { borderColor: colors.primary },
                  ]}
                >
                  <Text style={[styles.chipText, { color: colors.primary }]}>
                    {String(h.status).replace('_', ' ')}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </SectionCard>

        {/* Visual calendar of dates + tours */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            CALENDAR
          </Text>
        </View>
        <CalendarView events={calEvents} colors={colors} />

        {/* Tour requests - clickable, expand to view + respond */}
        <TourRequestsCard
          tours={tours ?? []}
          colors={colors}
          actingId={actingTour}
          allowReschedule
          onConfirm={(tid, when) => handleTour(tid, 'confirmed', when)}
          onDecline={(tid) => handleTour(tid, 'declined')}
        />

        {/* Financials - visible to all parties */}
        <FinancialsCard search={search} colors={colors} />

        {/* Offers received */}
        <OffersCard offers={offers ?? []} colors={colors} />

        {/* Signing links + designated signers */}
        <SigningLinksCard envelopes={envelopes ?? []} colors={colors} />

        {/* Important dates */}
        <SectionCard
          title="Important dates"
          count={dates?.length}
          colors={colors}
          actionLabel="+ Add"
          onActionPress={() =>
            router.push(`/(realtor)/clients/${id}/add-date` as any)
          }
        >
          {(dates ?? []).length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              None yet.
            </Text>
          ) : (
            (dates ?? []).map((d: any) => {
              const done = !!d.completed_at;
              return (
                <Pressable
                  key={d.id}
                  onPress={() => toggleDateDone(d.id, done)}
                  disabled={dateBusy === d.id}
                  style={[styles.dateRow, { borderBottomColor: colors.border }]}
                >
                  <Ionicons
                    name={done ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={done ? (colors.success || '#16a34a') : colors.textSecondary}
                    style={{ marginRight: 10 }}
                  />
                  <Text
                    style={[
                      styles.dateLabel,
                      {
                        color: done ? colors.textSecondary : colors.text,
                        textDecorationLine: done ? 'line-through' : 'none',
                        flex: 1,
                      },
                    ]}
                  >
                    {d.label}
                  </Text>
                  <Text style={[styles.dateValue, { color: colors.textSecondary }]}>
                    {new Date(d.date).toLocaleDateString()}
                  </Text>
                </Pressable>
              );
            })
          )}
        </SectionCard>

        {/* Documents */}
        <SectionCard
          title="Documents"
          count={documents?.length}
          colors={colors}
          actionLabel="+ Upload"
          onActionPress={() =>
            router.push(`/(realtor)/clients/${id}/upload` as any)
          }
        >
          {(documents ?? []).length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No documents.
            </Text>
          ) : (
            (documents ?? []).map((d: any) => (
              <View
                key={d.id}
                style={[styles.docRow, { borderBottomColor: colors.border }]}
              >
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={colors.textSecondary}
                />
                <Text
                  style={[styles.docName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {d.name}
                </Text>
              </View>
            ))
          )}
        </SectionCard>

        {/* People on this deal - mirrors web's "People" card. Shows everyone
            we've added as a deal_participants row (co-realtors, attorneys,
            inspectors, lenders, etc.). Tapping "+ Add" opens the same
            SMS-first Add Party screen. */}
        <SectionCard
          title="People on this deal"
          colors={colors}
          count={participants?.length}
          actionLabel="Manage"
          onActionPress={() =>
            router.push(`/(realtor)/clients/${id}/participants` as any)
          }
        >
          {(participants ?? []).length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No extra parties yet. Tap “+ Add” to invite the opposing realtor,
              an attorney, inspector, lender, etc.
            </Text>
          ) : (
            (participants ?? []).map((p: any) => (
              <View
                key={p.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}
                    numberOfLines={1}
                  >
                    {p.external_name || p.external_email || p.external_phone || 'Unnamed'}
                  </Text>
                  <Text
                    style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {(p.role || 'other').replace(/_/g, ' ')}
                    {p.external_email ? ' · ' + p.external_email : ''}
                    {p.external_phone ? ' · ' + p.external_phone : ''}
                  </Text>
                </View>
              </View>
            ))
          )}
        </SectionCard>

        {/* Activity */}
        <SectionCard
          title="Recent activity"
          colors={colors}
          count={activities?.length}
        >
          {(activities ?? []).length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              Nothing yet.
            </Text>
          ) : (
            (activities ?? [])
              .slice(0, 10)
              .map((a: any) => <ActivityRow key={a.id} activity={a} />)
          )}
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function ExpoImage({ uri }: { uri: string }) {
  // Wraps the Image element so the rest of the file stays clean.
  const { Image } = require('expo-image');
  return (
    <Image
      source={{ uri }}
      style={{ width: '100%', height: '100%', borderRadius: 8 }}
      contentFit="cover"
      transition={150}
    />
  );
}

function ActionTile({
  tone,
  icon,
  label,
  onPress,
}: {
  tone: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.tileIcon,
          { backgroundColor: tone + '1a' /* hex + alpha */ },
        ]}
      >
        <Ionicons name={icon} size={18} color={tone} />
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

function SectionCard({
  title,
  count,
  colors,
  children,
  actionLabel,
  onActionPress,
}: {
  title: string;
  count?: number;
  colors: ReturnType<typeof useTheme>['colors'];
  children: React.ReactNode;
  actionLabel?: string;
  onActionPress?: () => void;
}) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>
          {title}
          {typeof count === 'number' ? `  ${count}` : ''}
        </Text>
        {actionLabel && onActionPress && (
          <Pressable onPress={onActionPress} hitSlop={10}>
            <Text style={[styles.cardAction, { color: colors.primary }]}>
              {actionLabel}
            </Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 4 },
  section: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 4,
  },
  stepperCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  stepperDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBar: { flex: 1, height: 2, marginHorizontal: 4 },
  stepperLabels: {
    flexDirection: 'row',
    marginTop: 6,
    paddingHorizontal: 4,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    marginHorizontal: -4,
  },
  tile: {
    width: '25%',
    paddingHorizontal: 4,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  tileLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardAction: { fontSize: 13, fontWeight: '600' },
  empty: { fontSize: 13, fontStyle: 'italic', paddingVertical: 12 },
  houseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  housePhoto: {
    width: 56,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
  },
  houseAddr: { fontSize: 14, fontWeight: '600' },
  housePrice: { fontSize: 12, marginTop: 2 },
  houseStatusChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dateLabel: { fontSize: 14, fontWeight: '500' },
  dateValue: { fontSize: 13 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  docName: { fontSize: 14, flex: 1 },
});
