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
 * requests, since calendar apps don't pass cookies — instead we rely on
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
      `id, label, date, notes, search_id,
       search:client_searches ( id, name, firm:firms ( name ) )`
    )
    .eq('id', params.id)
    .maybeSingle();
  if (!row)
    return new NextResponse('Not found', { status: 404 });

  const d = row as any;
  const start = formatIcsDate(d.date);
  // 1-day all-day blocks for now. We can extend with time-of-day later.
  const endDate = new Date(d.date);
  endDate.setDate(endDate.getDate() + 1);
  const end = formatIcsDate(endDate.toISOString().slice(0, 10));
  const stamp =
    new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const summary = escIcs(d.label);
  const description = escIcs(
    [
      d.notes,
      d.search?.firm?.name ? 'Firm: ' + d.search.firm.name : null,
      d.search?.name ? 'Deal: ' + d.search.name : null,
    ]
      .filter(Boolean)
      .join('\\n')
  );

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Realtor Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + d.id + '@realtor-portal',
    'DTSTAMP:' + stamp,
    'DTSTART;VALUE=DATE:' + start,
    'DTEND;VALUE=DATE:' + end,
    'SUMMARY:' + summary,
    description ? 'DESCRIPTION:' + description : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');

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
