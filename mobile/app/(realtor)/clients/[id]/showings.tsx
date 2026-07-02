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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useHouses } from '@/lib/queries';
import {
  useShowings,
  useShowingFeedback,
  useScheduleShowing,
  useRescheduleShowing,
  useUpdateShowingStatus,
  type Showing,
} from '@/lib/dealActions';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

/**
 * Realtor showings screen - mobile mirror of the web deal workspace's
 * showings tools: list scheduled showings, schedule a new one, reschedule,
 * mark complete, or cancel. Emails/SMS to the deal parties fire from the
 * same web API the browser uses.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function toIso(dateStr: string, timeStr: string): string | null {
  if (!DATE_RE.test(dateStr) || !TIME_RE.test(timeStr)) return null;
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

function prettyWhen(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }) +
    ' at ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  );
}

const STATUS_TONE: Record<string, string> = {
  scheduled: '#2563EB',
  confirmed: '#059669',
  completed: '#0F172A',
  canceled: '#9CA3AF',
};

export default function ShowingsScreen() {
  const { id: searchId } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();

  const { data: showings, isLoading, refetch } = useShowings(searchId);
  const { data: feedback } = useShowingFeedback(searchId);
  const { data: houses } = useHouses(searchId);
  const schedule = useScheduleShowing();
  const reschedule = useRescheduleShowing();
  const updateStatus = useUpdateShowingStatus();

  // Form state - used for both "new showing" and "reschedule".
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Showing | null>(null);
  const [houseId, setHouseId] = useState<string>('');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [duration, setDuration] = useState('30');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const openNew = () => {
    setEditing(null);
    setHouseId((houses ?? [])[0]?.id || '');
    setDateStr('');
    setTimeStr('');
    setDuration('30');
    setLocation('');
    setNotes('');
    setFormOpen(true);
  };

  const openReschedule = (s: Showing) => {
    setEditing(s);
    setHouseId(s.house_id || '');
    const d = new Date(s.scheduled_at);
    setDateStr(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`
    );
    setTimeStr(
      `${String(d.getHours()).padStart(2, '0')}:${String(
        d.getMinutes()
      ).padStart(2, '0')}`
    );
    setDuration(String(s.duration_minutes || 30));
    setLocation(s.location || '');
    setNotes(s.notes || '');
    setFormOpen(true);
  };

  const submit = async () => {
    if (!searchId) return;
    const iso = toIso(dateStr.trim(), timeStr.trim());
    if (!iso) {
      toast.show('Use YYYY-MM-DD and 24h HH:MM (e.g. 2026-07-04 and 14:30).', {
        variant: 'error',
      });
      return;
    }
    const dur = Math.max(5, Math.min(480, Number(duration) || 30));
    try {
      if (editing) {
        await reschedule.mutateAsync({
          searchId,
          showingId: editing.id,
          scheduledAt: iso,
          durationMinutes: dur,
          location: location.trim() || null,
          notes: notes.trim() || null,
        });
        toast.show('Showing rescheduled. Everyone was notified.', {
          variant: 'success',
        });
      } else {
        await schedule.mutateAsync({
          searchId,
          houseId: houseId || null,
          scheduledAt: iso,
          durationMinutes: dur,
          location: location.trim() || null,
          notes: notes.trim() || null,
        });
        toast.show('Showing scheduled. Everyone was notified.', {
          variant: 'success',
        });
      }
      setFormOpen(false);
      await refetch();
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    }
  };

  const setStatus = async (
    s: Showing,
    status: 'completed' | 'canceled' | 'confirmed'
  ) => {
    if (!searchId) return;
    setBusyId(s.id);
    try {
      await updateStatus.mutateAsync({ searchId, showingId: s.id, status });
      await refetch();
      toast.show(
        status === 'completed'
          ? 'Showing marked complete.'
          : status === 'canceled'
            ? 'Showing canceled.'
            : 'Showing confirmed.',
        { variant: 'success' }
      );
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const saving = schedule.isPending || reschedule.isPending;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.text }]}>Showings</Text>
        <Pressable onPress={openNew} hitSlop={10}>
          <Ionicons name="add" size={26} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {formOpen && (
          <View
            style={[
              s.formCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[s.formTitle, { color: colors.text }]}>
              {editing ? 'Reschedule showing' : 'Schedule a showing'}
            </Text>

            {!editing && (houses ?? []).length > 0 && (
              <>
                <Text style={[s.label, { color: colors.textSecondary }]}>
                  PROPERTY
                </Text>
                <View style={s.chipRow}>
                  {(houses ?? []).map((h: any) => (
                    <Pressable
                      key={h.id}
                      onPress={() => setHouseId(h.id)}
                      style={[
                        s.chip,
                        {
                          borderColor:
                            houseId === h.id ? colors.primary : colors.border,
                          backgroundColor:
                            houseId === h.id
                              ? colors.primary + '14'
                              : 'transparent',
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          maxWidth: 180,
                          color:
                            houseId === h.id ? colors.primary : colors.text,
                        }}
                      >
                        {h.address || 'Home'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: colors.textSecondary }]}>
                  DATE (YYYY-MM-DD)
                </Text>
                <TextInput
                  value={dateStr}
                  onChangeText={setDateStr}
                  placeholder="2026-07-04"
                  autoCapitalize="none"
                  placeholderTextColor={colors.textSecondary + '88'}
                  style={[
                    s.input,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: colors.textSecondary }]}>
                  TIME (24H HH:MM)
                </Text>
                <TextInput
                  value={timeStr}
                  onChangeText={setTimeStr}
                  placeholder="14:30"
                  autoCapitalize="none"
                  placeholderTextColor={colors.textSecondary + '88'}
                  style={[
                    s.input,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: colors.textSecondary }]}>
                  DURATION (MIN)
                </Text>
                <TextInput
                  value={duration}
                  onChangeText={setDuration}
                  keyboardType="number-pad"
                  placeholder="30"
                  placeholderTextColor={colors.textSecondary + '88'}
                  style={[
                    s.input,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={[s.label, { color: colors.textSecondary }]}>
                  LOCATION (OPTIONAL)
                </Text>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Defaults to the property address"
                  placeholderTextColor={colors.textSecondary + '88'}
                  style={[
                    s.input,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                />
              </View>
            </View>

            <Text style={[s.label, { color: colors.textSecondary }]}>
              NOTES (OPTIONAL)
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Gate code, parking, who's attending…"
              placeholderTextColor={colors.textSecondary + '88'}
              style={[
                s.input,
                { color: colors.text, borderColor: colors.border, minHeight: 60 },
              ]}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={() => setFormOpen(false)}
                style={[s.btn, { borderColor: colors.border, borderWidth: 1 }]}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={saving}
                style={[
                  s.btn,
                  { backgroundColor: colors.primary, flex: 1, opacity: saving ? 0.6 : 1 },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {editing ? 'Save new time' : 'Schedule + notify everyone'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginTop: 40 }}
          />
        ) : (showings ?? []).length === 0 && !formOpen ? (
          <View style={{ alignItems: 'center', paddingTop: 48 }}>
            <Ionicons name="calendar-outline" size={40} color={colors.border} />
            <Text
              style={{
                color: colors.textSecondary,
                marginTop: 12,
                textAlign: 'center',
              }}
            >
              No showings yet. Tap + to schedule one - everyone on the deal gets
              an email and text.
            </Text>
          </View>
        ) : (
          (showings ?? []).map((sh) => {
            const tone = STATUS_TONE[sh.status] || colors.textSecondary;
            const done = sh.status === 'completed' || sh.status === 'canceled';
            return (
              <View
                key={sh.id}
                style={[
                  s.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{ color: colors.text, fontWeight: '700', fontSize: 14, flex: 1 }}
                    numberOfLines={1}
                  >
                    {sh.house?.address || sh.location || 'Showing'}
                  </Text>
                  <View style={[s.statusChip, { borderColor: tone }]}>
                    <Text style={{ color: tone, fontSize: 10, fontWeight: '700' }}>
                      {sh.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
                  {prettyWhen(sh.scheduled_at)} · {sh.duration_minutes} min
                </Text>
                {sh.location && sh.house?.address ? (
                  <Text
                    style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}
                    numberOfLines={1}
                  >
                    Location: {sh.location}
                  </Text>
                ) : null}
                {sh.notes ? (
                  <Text
                    style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}
                    numberOfLines={2}
                  >
                    {sh.notes}
                  </Text>
                ) : null}

                {(feedback ?? [])
                  .filter((f) => f.showing_id === sh.id)
                  .map((f) => (
                    <View
                      key={f.id}
                      style={{
                        marginTop: 10,
                        paddingTop: 8,
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: colors.border,
                      }}
                    >
                      <Text
                        style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}
                      >
                        Feedback from {f.author_name || f.author_email || 'a visitor'}
                        {f.stars ? ` · ${f.stars}/5` : ''}
                        {f.interest ? ` · ${f.interest.replace(/_/g, ' ')}` : ''}
                        {f.price_opinion
                          ? ` · ${f.price_opinion.replace(/_/g, ' ')}`
                          : ''}
                      </Text>
                      {f.liked ? (
                        <Text
                          style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}
                        >
                          Liked: {f.liked}
                        </Text>
                      ) : null}
                      {f.concerns ? (
                        <Text
                          style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}
                        >
                          Concerns: {f.concerns}
                        </Text>
                      ) : null}
                    </View>
                  ))}

                {!done && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    {busyId === sh.id ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <>
                        <Pressable
                          onPress={() => openReschedule(sh)}
                          style={[s.smallBtn, { borderColor: colors.border }]}
                        >
                          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
                            Reschedule
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setStatus(sh, 'completed')}
                          style={[s.smallBtn, { borderColor: '#059669' }]}
                        >
                          <Text style={{ color: '#059669', fontSize: 12, fontWeight: '600' }}>
                            Mark complete
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setStatus(sh, 'canceled')}
                          style={[s.smallBtn, { borderColor: colors.border }]}
                        >
                          <Text
                            style={{
                              color: colors.textSecondary,
                              fontSize: 12,
                              fontWeight: '600',
                            }}
                          >
                            Cancel
                          </Text>
                        </Pressable>
                      </>
                    )}
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
  formCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 16,
  },
  formTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 10,
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
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 10,
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  smallBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
