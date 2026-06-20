/**
 * Tiny zero-dep ICS (iCalendar) builder. Produces a single VEVENT wrapped
 * in a VCALENDAR - enough for "tap to add to calendar" on iOS/Android/macOS.
 *
 * We deliberately do NOT pull in `ics` or `node-ical` - the spec is small
 * and we only need one event shape (a tour appointment).
 */

export type IcsEvent = {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  /** Start time. If invalid or missing, defaults to 5pm today (caller's TZ via UTC). */
  start: Date | null;
  /** Duration in minutes. Defaults to 60. */
  durationMinutes?: number;
  organizerEmail?: string;
  organizerName?: string;
  attendeeEmail?: string;
  attendeeName?: string;
};

function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

/** Format a Date as an iCal UTC timestamp: YYYYMMDDTHHMMSSZ */
function toIcsUtc(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

/**
 * Resolve a start date from a free-text or Date input. Falls back to 5pm
 * today (local) if the input doesn't parse to a real Date.
 *
 * The "5pm today" fallback matches what tour confirmations tend to default
 * to in the realtor's UX - it's a reasonable late-afternoon showing slot
 * and keeps the .ics from being literally "right now."
 */
export function resolveTourStart(input: Date | string | null | undefined): Date {
  if (input instanceof Date && !isNaN(input.getTime())) return input;
  if (typeof input === 'string') {
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  const fallback = new Date();
  fallback.setHours(17, 0, 0, 0);
  return fallback;
}

/**
 * RFC 5545 long-line folding: lines over 75 octets must be folded with
 * CRLF + space. We fold conservatively at 73 chars to stay under the
 * limit even with a few multibyte chars.
 */
function foldLine(line: string): string {
  if (line.length <= 73) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const slice = line.slice(i, i + (i === 0 ? 73 : 72));
    out.push(slice);
    i += slice.length;
  }
  return out.join('\r\n ');
}

/** Escape ICS TEXT-typed values per RFC 5545 §3.3.11. */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Build an .ics calendar invite body for a tour event.
 * Returns a plain UTF-8 string with CRLF line endings.
 */
export function buildTourIcs(event: IcsEvent): string {
  const start = resolveTourStart(event.start);
  const durationMin = Math.max(1, event.durationMinutes ?? 60);
  const end = new Date(start.getTime() + durationMin * 60_000);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Realtor Portal//Tour//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
  ];

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeText(event.location)}`);
  }
  if (event.organizerEmail) {
    const cn = event.organizerName ? `;CN=${escapeText(event.organizerName)}` : '';
    lines.push(`ORGANIZER${cn}:mailto:${event.organizerEmail}`);
  }
  if (event.attendeeEmail) {
    const cn = event.attendeeName ? `;CN=${escapeText(event.attendeeName)}` : '';
    lines.push(
      `ATTENDEE${cn};RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:${event.attendeeEmail}`
    );
  }
  lines.push('STATUS:CONFIRMED');
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join('\r\n');
}

/**
 * Convenience: produce an attachment-shaped object for sendEmail().
 * MIME type is application/octet-stream per the spec - keeps mail clients
 * from rendering the file inline, encourages "open with calendar."
 */
export function buildTourIcsAttachment(event: IcsEvent): {
  filename: string;
  content: Buffer;
  contentType: string;
} {
  const ics = buildTourIcs(event);
  return {
    filename: 'tour.ics',
    content: Buffer.from(ics, 'utf8'),
    contentType: 'application/octet-stream',
  };
}

/**
 * Build a multi-event VCALENDAR feed (suitable for webcal:// subscription).
 *
 * Used for the per-deal calendar feed served at /api/calendar/[searchId].ics
 * - it contains every important_date and confirmed tour for the deal so the
 * client can subscribe in Apple Calendar / Google Calendar and have a live
 * read-only view of every milestone.
 */
export function buildCalendarFeed(
  calendarName: string,
  events: IcsEvent[]
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Realtor Portal//Deal feed//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    'METHOD:PUBLISH',
  ];

  for (const ev of events) {
    const start = resolveTourStart(ev.start);
    const durationMin = Math.max(1, ev.durationMinutes ?? 60);
    const end = new Date(start.getTime() + durationMin * 60_000);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${toIcsUtc(new Date())}`);
    lines.push(`DTSTART:${toIcsUtc(start)}`);
    lines.push(`DTEND:${toIcsUtc(end)}`);
    lines.push(`SUMMARY:${escapeText(ev.summary)}`);
    if (ev.description) {
      lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    }
    if (ev.location) {
      lines.push(`LOCATION:${escapeText(ev.location)}`);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n');
}

/**
 * Compute the stateless HMAC token that guards a deal's calendar feed.
 *
 * token = base64url(HMAC_SHA256(searchId, CALENDAR_FEED_SECRET))
 *
 * Calendar apps fetch the feed with no cookies, so the URL itself has to be
 * the credential. We derive an unguessable token from the searchId rather
 * than storing one - no extra table, and revocation is as simple as rotating
 * the secret.
 */
export function computeCalendarFeedToken(searchId: string, secret: string): string {
  // Lazy require so this module stays usable in any runtime that doesn't
  // touch the token path (the email/attachment helpers don't need crypto).
  const { createHmac } = require('crypto') as typeof import('crypto');
  return createHmac('sha256', secret).update(searchId).digest('base64url');
}

/**
 * Build the full subscribe URL for a deal's calendar feed, including the
 * HMAC token query param. Returns null if CALENDAR_FEED_SECRET is unset so
 * callers can hide the "Subscribe to calendar" affordance gracefully.
 */
export function buildCalendarFeedUrl(searchId: string): string | null {
  const secret = process.env.CALENDAR_FEED_SECRET;
  if (!secret) return null;
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://realtorportal.parallelstudios.co';
  const token = computeCalendarFeedToken(searchId, secret);
  return `${base.replace(/\/$/, '')}/api/calendar/${searchId}?t=${token}`;
}
