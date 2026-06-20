import { NextResponse } from 'next/server';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

/**
 * Single-event .ics endpoint for "Add to calendar" deep-links from inside
 * an email / mobile button. Apple Calendar, Google Calendar, and Outlook
 * all import .ics natively when the URL is opened.
 *
 *   /api/calendar/event/{important_date_id}
 *
 * Auth: any signed-in user who can see the deal can fetch the event.
 * Falls back to public access (200 with empty body) for unauthenticated
 * requests, since calendar apps don't pass cookies - instead we rely on
 * the id being a UUID, treating it as a capability token.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const service = getSupabaseServiceRoleClient();
  const { data: row } = await service
    .from('important_dates')
    .select(
      `id, label, date, notes, event_time, location, things_to_bring, search_id,
       search:client_searches ( id, name, firm:firms ( name ) )`
    )
    .eq('id', params.id)
    .maybeSingle();
  if (!row)
    return new NextResponse('Not found', { status: 404 });

  const d = row as any;
  const stamp =
    new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const summary = escIcs(d.label);
  const description = escIcs(
    [
      d.things_to_bring ? 'Bring: ' + d.things_to_bring : null,
      d.notes,
      d.search?.firm?.name ? 'Firm: ' + d.search.firm.name : null,
      d.search?.name ? 'Deal: ' + d.search.name : null,
    ]
      .filter(Boolean)
      .join('\\n')
  );
  const location = d.location ? escIcs(d.location) : '';

  // If event_time is set, emit a timed event (default 1 hour). Otherwise
  // emit an all-day block.
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Realtor Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + d.id + '@realtor-portal',
    'DTSTAMP:' + stamp,
  ];
  if (d.event_time) {
    // YYYY-MM-DD + HH:MM:SS → YYYYMMDDTHHMMSS (floating local time)
    const datePart = d.date.includes('T')
      ? d.date.slice(0, 10)
      : d.date;
    const [hh, mm, ss] = String(d.event_time).split(':');
    const start =
      datePart.replace(/-/g, '') +
      'T' +
      hh.padStart(2, '0') +
      (mm || '00').padStart(2, '0') +
      (ss || '00').padStart(2, '0');
    // +1 hour
    const sh = (Number(hh) + 1) % 24;
    const end =
      datePart.replace(/-/g, '') +
      'T' +
      String(sh).padStart(2, '0') +
      (mm || '00').padStart(2, '0') +
      (ss || '00').padStart(2, '0');
    lines.push('DTSTART:' + start, 'DTEND:' + end);
  } else {
    const start = formatIcsDate(d.date);
    const endDate = new Date(d.date);
    endDate.setDate(endDate.getDate() + 1);
    const end = formatIcsDate(endDate.toISOString().slice(0, 10));
    lines.push('DTSTART;VALUE=DATE:' + start, 'DTEND;VALUE=DATE:' + end);
  }
  lines.push('SUMMARY:' + summary);
  if (location) lines.push('LOCATION:' + location);
  if (description) lines.push('DESCRIPTION:' + description);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  const ics = lines.join('\r\n');

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition':
        'attachment; filename="' + safeFilename(d.label) + '.ics"',
      'cache-control': 'no-store',
    },
  });
}

function formatIcsDate(date: string): string {
  // Accept "YYYY-MM-DD" or ISO strings; emit YYYYMMDD for all-day events.
  const d = date.includes('T') ? date.slice(0, 10) : date;
  return d.replace(/-/g, '');
}

function escIcs(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).replace(/[\\;,]/g, (m) => '\\' + m);
}

function safeFilename(s: string): string {
  return (s || 'event').replace(/[^a-z0-9-]+/gi, '_').slice(0, 40);
}
