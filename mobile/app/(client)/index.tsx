import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  Pressable,
  Linking,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import {
  useClientSearches,
  useImportantDates,
  useActivities,
} from '@/lib/queries';
import { Skeleton, SkeletonRow } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

/**
 * Pop these on the client when the realtor advances the deal phase. Shown
 * exactly once per (user, search, phase) — the mark_deal_phase_seen RPC
 * records the dismissal so we don't nag the next time the screen opens.
 */
const CELEBRATIONS: Record<
  string,
  { emoji: string; title: string; body: string }
> = {
  offer_made: {
    emoji: '🎯',
    title: 'Offer is in!',
    body: 'Your agent submitted your offer. Fingers crossed — we\'ll let you know the moment we hear back.',
  },
  counter_offer: {
    emoji: '↩️',
    title: 'Counter on the table',
    body: 'You\'re in counter-offer mode. Your agent is negotiating on your behalf.',
  },
  under_contract: {
    emoji: '🎉',
    title: 'You\'re under contract!',
    body: 'Huge step. Inspection and appraisal come next — your important dates are in this app.',
  },
  closing: {
    emoji: '🏁',
    title: 'Closing time!',
    body: 'Wire instructions and final paperwork are headed your way. Almost home.',
  },
  closed: {
    emoji: '🏡',
    title: 'Welcome home!',
    body: 'The house is officially yours. Congrats — your agent will be in touch about handoff details.',
  },
};

const PHASES = [
  { id: 'searching', label: 'Searching' },
  { id: 'offer_made', label: 'Offer' },
  { id: 'counter_offer', label: 'Counter' },
  { id: 'under_contract', label: 'Under contract' },
  { id: 'closing', label: 'Closing' },
  { id: 'closed', label: 'Closed' },
] as const;

export default function ClientHomeScreen() {
  const { user, userProfile } = useAuth();
  const { colors, firm } = useTheme();

  const {
    data: searches,
    isLoading: searchesLoading,
    refetch: refetchSearches,
  } = useClientSearches(userProfile?.firm_id, false, user?.id);

  const activeSearch = searches?.[0];

  const { data: dates, refetch: refetchDates } = useImportantDates(
    activeSearch?.id,
  );
  const { data: activities } = useActivities(activeSearch?.id);

  const { data: realtor } = useQuery({
    queryKey: ['realtor-for-search', activeSearch?.id],
    queryFn: async () => {
      if (!activeSearch?.realtor_id) return null;
      const { data } = await supabase
        .from('users')
        .select('full_name, email, phone_number')
        .eq('id', activeSearch.realtor_id)
        .maybeSingle();
      return data;
    },
    enabled: !!activeSearch?.realtor_id,
  });

  const upcoming = useMemo(() => (dates ?? []).slice(0, 4), [dates]);

  const phaseIdx = activeSearch
    ? PHASES.findIndex((p) => p.id === activeSearch.phase)
    : -1;

  const onRefresh = async () => {
    await Promise.all([refetchSearches(), refetchDates()]);
  };

  const brand = firm?.brand_color || colors.primary;

  // Phase celebration. The first time this user opens the client home
  // after a phase change, pop a celebration modal. Persistence lives in
  // public.user_deal_views via the mark_deal_phase_seen RPC.
  const [celebration, setCelebration] = useState<null | {
    emoji: string;
    title: string;
    body: string;
    phase: string;
    searchId: string;
  }>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeSearch?.id || !activeSearch?.phase || !user?.id) return;
      const sb: any = supabase;
      const { data } = await sb
        .from('user_deal_views')
        .select('last_seen_phase')
        .eq('user_id', user.id)
        .eq('search_id', activeSearch.id)
        .maybeSingle();
      if (cancelled) return;
      const seen: string | null | undefined = data?.last_seen_phase;
      if (seen !== activeSearch.phase) {
        const c = CELEBRATIONS[activeSearch.phase as string];
        if (c && activeSearch.phase !== 'searching') {
          setCelebration({
            emoji: c.emoji,
            title: c.title,
            body: c.body,
            phase: activeSearch.phase as string,
            searchId: activeSearch.id,
          });
        } else {
          await sb.rpc('mark_deal_phase_seen', {
            p_search_id: activeSearch.id,
            p_phase: activeSearch.phase,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSearch?.id, activeSearch?.phase, user?.id]);

  async function dismissCelebration() {
    if (celebration) {
      try {
        const sb: any = supabase;
        await sb.rpc('mark_deal_phase_seen', {
          p_search_id: celebration.searchId,
          p_phase: celebration.phase,
        });
      } catch {}
    }
    setCelebration(null);
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      {/* Phase celebration popup */}
      <Modal
        visible={!!celebration}
        transparent
        animationType="fade"
        onRequestClose={dismissCelebration}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15,23,42,0.45)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: '#fff',
              borderRadius: 24,
              padding: 28,
              alignItems: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.2,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: 12,
            }}
          >
            <Text style={{ fontSize: 56, marginBottom: 8 }}>
              {celebration?.emoji}
            </Text>
            <Text
              style={{
                fontSize: 22,
                fontWeight: '800',
                textAlign: 'center',
                color: '#0F172A',
              }}
            >
              {celebration?.title}
            </Text>
            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                lineHeight: 20,
                textAlign: 'center',
                color: '#475569',
              }}
            >
              {celebration?.body}
            </Text>
            <Pressable
              onPress={dismissCelebration}
              style={({ pressed }) => ({
                marginTop: 22,
                paddingHorizontal: 28,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: brand,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}
              >
                Got it
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={searchesLoading}
            onRefresh={onRefresh}
            tintColor={brand}
          />
        }
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Branded hero */}
        <View style={[s.hero, { backgroundColor: brand }]}>
          <View style={s.heroRow}>
            <View style={{ flex: 1 }}>
              {firm?.name && <Text style={s.heroFirm}>{firm.name}</Text>}
              <Text style={s.heroGreeting}>
                Hi{userProfile?.full_name ? ', ' + userProfile.full_name.split(' ')[0] : ''}
              </Text>
              {activeSearch && (
                <Text style={s.heroSub}>
                  Phase:{' '}
                  <Text style={{ fontWeight: '700' }}>
                    {String(activeSearch.phase).replace(/_/g, ' ')}
                  </Text>
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => router.push('/(client)/profile' as any)}
              hitSlop={10}
              style={({ pressed }) => [s.profileBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="person-circle-outline" size={28} color="#fff" />
            </Pressable>
          </View>
        </View>

        {searches === undefined ? (
          <View style={{ padding: 16, gap: 12 }}>
            <Skeleton width="100%" height={80} borderRadius={14} />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : !activeSearch ? (
          <View style={{ padding: 16 }}>
            <EmptyState
              icon="home-outline"
              title="No active deal yet"
              body="Your realtor will get you set up soon. Once they do, your deal progress, important dates, and documents will show up here."
            />
          </View>
        ) : (
          <View style={{ padding: 16, gap: 12 }}>
            {/* Phase stepper */}
            <Card colors={colors}>
              <Label colors={colors}>DEAL PROGRESS</Label>
              <View style={s.stepperRow}>
                {PHASES.map((p, i) => {
                  const done = phaseIdx >= 0 && i <= phaseIdx;
                  return (
                    <View key={p.id} style={s.stepperCell}>
                      <View
                        style={[
                          s.stepperDot,
                          { backgroundColor: done ? brand : colors.border },
                        ]}
                      >
                        <Text
                          style={{
                            color: done ? '#fff' : colors.textSecondary,
                            fontWeight: '700',
                            fontSize: 10,
                          }}
                        >
                          {i + 1}
                        </Text>
                      </View>
                      {i < PHASES.length - 1 && (
                        <View
                          style={[
                            s.stepperBar,
                            {
                              backgroundColor:
                                done && i < phaseIdx ? brand : colors.border,
                            },
                          ]}
                        />
                      )}
                    </View>
                  );
                })}
              </View>
              <View style={s.stepperLabels}>
                {PHASES.map((p, i) => (
                  <Text
                    key={p.id}
                    style={{
                      flex: 1,
                      fontSize: 8,
                      textAlign: 'center',
                      color: phaseIdx === i ? colors.text : colors.textSecondary,
                      fontWeight: phaseIdx === i ? '700' : '500',
                    }}
                  >
                    {p.label}
                  </Text>
                ))}
              </View>
            </Card>

            {/* Deal milestones — surfaces whatever the realtor stamped on
                the deal as they moved through phases. Shows up only when
                there's something worth showing so an early-stage deal
                doesn't waste space. */}
            {(((activeSearch as any).offer_amount &&
              (activeSearch as any).offer_amount > 0) ||
              ((activeSearch as any).counter_offer_amount &&
                (activeSearch as any).counter_offer_amount > 0) ||
              (activeSearch as any).agreed_price ||
              (activeSearch as any).closing_date ||
              (activeSearch as any).closed_message) && (
              <Card colors={colors}>
                <Label colors={colors}>DEAL MILESTONES</Label>
                <View style={{ gap: 8, marginTop: 4 }}>
                  {(activeSearch as any).offer_amount ? (
                    <MilestoneRow
                      colors={colors}
                      label="Offer made"
                      value={
                        '$' +
                        Number(
                          (activeSearch as any).offer_amount
                        ).toLocaleString()
                      }
                    />
                  ) : null}
                  {(activeSearch as any).counter_offer_amount ? (
                    <MilestoneRow
                      colors={colors}
                      label="Counter offer"
                      value={
                        '$' +
                        Number(
                          (activeSearch as any).counter_offer_amount
                        ).toLocaleString()
                      }
                    />
                  ) : null}
                  {(activeSearch as any).agreed_price ? (
                    <MilestoneRow
                      colors={colors}
                      label="Agreed price"
                      value={
                        '$' +
                        Number(
                          (activeSearch as any).agreed_price
                        ).toLocaleString()
                      }
                    />
                  ) : null}
                  {(activeSearch as any).closing_date ? (
                    <MilestoneRow
                      colors={colors}
                      label="Closing day"
                      value={new Date(
                        (activeSearch as any).closing_date
                      ).toLocaleDateString()}
                    />
                  ) : null}
                  {(activeSearch as any).closed_message ? (
                    <View
                      style={{
                        marginTop: 4,
                        padding: 10,
                        borderRadius: 10,
                        backgroundColor: brand + '11',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: colors.text,
                          lineHeight: 18,
                        }}
                      >
                        💬 {(activeSearch as any).closed_message}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Card>
            )}

            {/* Realtor */}
            {realtor && (
              <Card colors={colors}>
                <Label colors={colors}>YOUR REALTOR</Label>
                <View style={s.realtorRow}>
                  <View style={[s.realtorAvatar, { backgroundColor: brand + '22' }]}>
                    <Text style={{ color: brand, fontWeight: '700', fontSize: 18 }}>
                      {(realtor.full_name || '?').slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
                      {realtor.full_name || realtor.email}
                    </Text>
                    {realtor.email && (
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                        {realtor.email}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={s.realtorActions}>
                  <RealtorAction
                    icon="chatbubble"
                    label="Message"
                    onPress={() => router.push('/(client)/messages' as any)}
                    tone={brand}
                  />
                  {realtor.email && (
                    <RealtorAction
                      icon="mail"
                      label="Email"
                      onPress={() => Linking.openURL('mailto:' + realtor.email)}
                      tone={brand}
                    />
                  )}
                  {realtor.phone_number && (
                    <RealtorAction
                      icon="call"
                      label="Call"
                      onPress={() => Linking.openURL('tel:' + realtor.phone_number)}
                      tone={brand}
                    />
                  )}
                </View>
              </Card>
            )}

            {/* Important dates */}
            <Card colors={colors}>
              <Label colors={colors}>IMPORTANT DATES</Label>
              {upcoming.length === 0 ? (
                <Text style={[s.empty, { color: colors.textSecondary }]}>
                  Nothing scheduled yet.
                </Text>
              ) : (
                upcoming.map((d: any) => (
                  <View
                    key={d.id}
                    style={[s.dateRow, { borderBottomColor: colors.border }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '500' }}>
                      {d.label}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {new Date(d.date).toLocaleDateString()}
                    </Text>
                  </View>
                ))
              )}
            </Card>

            {/* Quick links */}
            <View style={s.quickRow}>
              <QuickLink
                colors={colors}
                icon="business"
                label="Houses"
                onPress={() => router.push('/(client)/houses' as any)}
              />
              <QuickLink
                colors={colors}
                icon="chatbubble-ellipses"
                label="Messages"
                onPress={() => router.push('/(client)/messages' as any)}
              />
              <QuickLink
                colors={colors}
                icon="document-text"
                label="Docs"
                onPress={() => router.push('/(client)/documents' as any)}
              />
            </View>

            {/* Activity */}
            {activities && activities.length > 0 && (
              <Card colors={colors}>
                <Label colors={colors}>RECENT UPDATES</Label>
                {activities.slice(0, 5).map((a: any) => (
                  <View
                    key={a.id}
                    style={[s.activityRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, color: colors.text }} numberOfLines={2}>
                        <Text style={{ fontWeight: '600' }}>
                          {String(a.action).replace(/_/g, ' ')}
                        </Text>
                        {a.target ? ' — ' + a.target : ''}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                      {timeAgo(a.created_at)}
                    </Text>
                  </View>
                ))}
              </Card>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({
  colors,
  children,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        s.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {children}
    </View>
  );
}

function Label({
  colors,
  children,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  children: React.ReactNode;
}) {
  return (
    <Text style={[s.label, { color: colors.textSecondary }]}>{children}</Text>
  );
}

function MilestoneRow({
  colors,
  label,
  value,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 13, color: colors.textSecondary }}>
        {label}
      </Text>
      <Text style={{ fontSize: 14, color: colors.text, fontWeight: '700' }}>
        {value}
      </Text>
    </View>
  );
}

function RealtorAction({
  icon,
  label,
  onPress,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.realtorActionBtn,
        { backgroundColor: tone + '11', opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Ionicons name={icon} size={16} color={tone} />
      <Text style={{ color: tone, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function QuickLink({
  colors,
  icon,
  label,
  onPress,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.quickLink,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  const d = Math.floor(h / 24);
  return d + 'd';
}

const s = StyleSheet.create({
  container: { flex: 1 },
  hero: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 28 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroFirm: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroGreeting: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 2 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 8 },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  stepperRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 },
  stepperCell: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stepperDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBar: { flex: 1, height: 2, marginHorizontal: 4 },
  stepperLabels: { flexDirection: 'row', marginTop: 6 },
  realtorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  realtorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  realtorActions: { flexDirection: 'row', gap: 8 },
  realtorActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  empty: { fontSize: 13, fontStyle: 'italic', paddingVertical: 4 },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickLink: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
