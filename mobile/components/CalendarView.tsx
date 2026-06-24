import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type CalEvent = {
  dateStr: string; // YYYY-MM-DD
  label: string;
  kind: 'date' | 'tour';
  time?: string | null;
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/**
 * A visual month calendar shared by clients and realtors. Shows important
 * dates and tours as dots; tap a day to see what's on it. Dependency-free.
 */
export function CalendarView({
  events,
  colors,
  flush = false,
}: {
  events: CalEvent[];
  colors: any;
  flush?: boolean;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(ymd(today));

  const byDay = useMemo(() => {
    const m: Record<string, CalEvent[]> = {};
    for (const e of events || []) {
      if (!e?.dateStr) continue;
      (m[e.dateStr] = m[e.dateStr] || []).push(e);
    }
    return m;
  }, [events]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build a 6x7 grid of day numbers (null for blanks).
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedEvents = selected ? byDay[selected] || [] : [];
  const todayStr = ymd(today);

  return (
    <View style={[styles.wrap, flush && { marginHorizontal: 0 }, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <Pressable
          hitSlop={10}
          onPress={() => setCursor(new Date(year, month - 1, 1))}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.monthLabel, { color: colors.text }]}>
          {MONTHS[month]} {year}
        </Text>
        <Pressable
          hitSlop={10}
          onPress={() => setCursor(new Date(year, month + 1, 1))}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={[styles.weekday, { color: colors.textSecondary }]}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (d === null) return <View key={i} style={styles.cell} />;
          const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const has = !!byDay[ds];
          const isToday = ds === todayStr;
          const isSel = ds === selected;
          return (
            <Pressable key={i} style={styles.cell} onPress={() => setSelected(ds)}>
              <View
                style={[
                  styles.dayDot,
                  isSel && { backgroundColor: colors.primary },
                  !isSel && isToday && { borderColor: colors.primary, borderWidth: 1.5 },
                ]}
              >
                <Text
                  style={{
                    color: isSel ? '#fff' : colors.text,
                    fontSize: 13,
                    fontWeight: isToday || has ? '700' : '400',
                  }}
                >
                  {d}
                </Text>
              </View>
              {has ? (
                <View
                  style={[
                    styles.evtDot,
                    { backgroundColor: isSel ? colors.primary : (colors.warning || '#d97706') },
                  ]}
                />
              ) : (
                <View style={styles.evtDotEmpty} />
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.eventsBox, { borderTopColor: colors.border }]}>
        {selectedEvents.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            Nothing scheduled this day.
          </Text>
        ) : (
          selectedEvents.map((e, i) => (
            <View key={i} style={styles.evtRow}>
              <Ionicons
                name={e.kind === 'tour' ? 'home-outline' : 'flag-outline'}
                size={15}
                color={colors.primary}
              />
              <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                {e.label}
                {e.time ? `  ·  ${e.time}` : ''}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderRadius: 14, padding: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  monthLabel: { fontSize: 15, fontWeight: '800' },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  dayDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evtDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  evtDotEmpty: { width: 5, height: 5, marginTop: 2 },
  eventsBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, gap: 6 },
  evtRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
