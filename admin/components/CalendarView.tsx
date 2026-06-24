'use client';

import { useMemo, useState } from 'react';

export type CalEvent = {
  dateStr: string; // YYYY-MM-DD
  label: string;
  kind: 'date' | 'tour';
  time?: string | null;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
 * Shared month calendar for the web client portal and deal views. Shows
 * important dates and tours; click a day to see what's on it.
 */
export function CalendarView({
  events,
  accent = '#0F172A',
}: {
  events: CalEvent[];
  accent?: string;
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
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = ymd(today);
  const selectedEvents = selected ? byDay[selected] || [] : [];

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-soft-sm">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="rounded-lg px-2 py-1 text-ink-500 hover:bg-ink-50"
          aria-label="Previous month"
        >
          ‹
        </button>
        <div className="text-sm font-bold text-ink-900">
          {MONTHS[month]} {year}
        </div>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="rounded-lg px-2 py-1 text-ink-500 hover:bg-ink-50"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-ink-400">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const has = !!byDay[ds];
          const isToday = ds === todayStr;
          const isSel = ds === selected;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(ds)}
              className="flex flex-col items-center py-1"
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm transition"
                style={
                  isSel
                    ? { backgroundColor: accent, color: '#fff', fontWeight: 700 }
                    : isToday
                      ? { border: `2px solid ${accent}`, fontWeight: 700 }
                      : { fontWeight: has ? 700 : 400 }
                }
              >
                {d}
              </span>
              <span
                className="mt-0.5 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: has ? (isSel ? accent : '#d97706') : 'transparent' }}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-1.5 border-t border-ink-100 pt-3">
        {selectedEvents.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing scheduled this day.</p>
        ) : (
          selectedEvents.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-ink-800">
              <span
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: e.kind === 'tour' ? accent : '#d97706' }}
              />
              <span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  {e.kind === 'tour' ? 'Tour' : 'Date'}
                </span>{' '}
                {e.label}
                {e.time ? `  ·  ${e.time}` : ''}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
