/**
 * Date formatting helpers — timezone-stable for DATE-ONLY values.
 *
 * Postgres `date` columns (e.g. important_dates.date, client_searches.closing_date)
 * come back as "YYYY-MM-DD" strings with NO timezone. The naive
 * `new Date('2026-06-06').toLocaleDateString()` parses that as UTC midnight,
 * then shifts it into the viewer's local timezone — so in ET it renders as
 * 6/5/2026, and the SERVER (UTC) and CLIENT (local) disagree, which throws
 * React hydration errors (#418/#422/#425).
 *
 * `formatDateOnly` instead reads the LITERAL year/month/day off the string and
 * formats from a local-constructed Date, so the output is identical on the
 * server and the client regardless of timezone. Use it for every DATE-ONLY
 * value. For genuine `timestamptz` values that legitimately depend on the
 * viewer's timezone, use the <LocalDateTime/> component instead.
 */

/** Parse the literal Y/M/D out of a "YYYY-MM-DD" (or ISO) date string. */
function parseYmd(
  value: string
): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/**
 * Format a DATE-ONLY value ("YYYY-MM-DD" or ISO) using its literal calendar
 * day, with no timezone shift. Output is identical on server and client.
 * Returns '' for null/undefined/unparseable input.
 *
 * Default style matches the previous `toLocaleDateString()` (e.g. "6/6/2026").
 * Pass Intl options to customize (a fixed `timeZone: 'UTC'` is applied so the
 * result never depends on the runtime's zone).
 */
export function formatDateOnly(
  value: string | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
  locale: string = 'en-US'
): string {
  if (!value) return '';
  const parts = parseYmd(value);
  if (!parts) return '';
  // Construct at UTC midnight and force timeZone:'UTC' so formatting reads the
  // same literal day everywhere. (Date(y, m-1, d) would be local-stable too,
  // but a UTC anchor + UTC formatting is bulletproof across server/client.)
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  return date.toLocaleDateString(locale, { timeZone: 'UTC', ...opts });
}

/** "Sat, Jun 6" style for a DATE-ONLY value. Timezone-stable. */
export function formatDateOnlyLong(
  value: string | null | undefined,
  locale: string = 'en-US'
): string {
  return formatDateOnly(
    value,
    { weekday: 'short', month: 'short', day: 'numeric' },
    locale
  );
}
