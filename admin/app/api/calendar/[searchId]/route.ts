import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import {
  buildCalendarFeed,
  computeCalendarFeedToken,
  type IcsEvent,
} from '@/lib/ics';

export const dynamic = 'force-dynamic';

/**
 * Subscribable read-only calendar feed for a single client_searches deal.
 *
 * URL: /api/calendar/{searchId}?t={token}
 *   (a trailing .ics on the id is tolerated for clients that append one)
 *
 * Authentication: stateless HMAC. Calendar apps fetch the feed with no
 * cookies, so the URL itself is the credential. The token is
 * base64url(HMAC_SHA256(searchId, CALENDAR_FEED_SECRET)); only someone with
 * the secret could have minted it. No DB table, and rotating the secret
 * revokes every outstanding subscription at once.
 *
 * The feed carries only milestone dates, showings, and tour requests plus the
 * property address — no documents, no messages.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { searchId: string } }
) {
  const secret = process.env.CALENDAR_FEED_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Calendar feed not configured' },
      { status: 503 }
    );
  }

  const rawId = params.searchId.replace(/\.ics$/, '');
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      rawId
    );
  if (!isUuid) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const provided = req.nextUrl.searchParams.get('t') || '';
  const expected = computeCalendarFeedToken(rawId, secret);
  if (!tokensMatch(provided, expected)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const service = getSupabaseServiceRoleClient();

  const { data: search } = await service
    .from('client_searches')
    .select(
      `id, name, firm_id,
       firm:firms ( name )`
    )
    .eq('id', rawId)
    .maybeSingle();

  if (!search) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const firmName = (search as any).firm?.name || 'Realtor Portal';
  const calName = (search.name ? search.name + ' — ' : '') + firmName;

  const events: IcsEvent[] = [];

  // 1. Important dates (closing, appraisal, inspection, custom).
  const { data: dates } = await service
    .from('important_dates')
    .select('id, label, date, notes, event_time, location')
    .eq('search_id', rawId)
    .order('date', { ascending: true });

  for (const d of dates || []) {
    if (!d.date) continue;
    const start = new Date(d.date as string);
    if (isNaN(start.getTime())) continue;
    if (d.event_time && /^\d{2}:\d{2}/.test(String(d.event_time))) {
      // event_time is a wall-clock "HH:MM[:SS]" with no zone. Apply it as-is
      // on top of the date; treating it as UTC keeps the displayed time stable.
      const [hh, mm] = String(d.event_time).split(':');
      start.setUTCHours(Number(hh), Number(mm), 0, 0);
    } else {
      // No time set — anchor mid-morning so it reads as a daytime milestone.
      start.setUTCHours(13, 0, 0, 0);
    }
    events.push({
      uid: 'date-' + d.id + '@realtor-portal',
      summary: d.label || 'Important date',
      description: d.notes || undefined,
      location: d.location || undefined,
      start,
      durationMinutes: 60,
    });
  }

  // 2. Scheduled showings (migration 0030) — concrete timestamps.
  const { data: showings } = await service
    .from('showings')
    .select(
      `id, scheduled_at, duration_minutes, location, notes, status,
       house:houses ( id, address )`
    )
    .eq('search_id', rawId)
    .order('scheduled_at', { ascending: true });

  for (const s of showings || []) {
    if ((s as any).status === 'cancelled') continue;
    const start = s.scheduled_at ? new Date(s.scheduled_at as string) : null;
    const houseRel = (s as any).house as
      | { id: string; address?: string | null }
      | null;
    const address = s.location || houseRel?.address || undefined;
    events.push({
      uid: 'showing-' + s.id + '@realtor-portal',
      summary: 'Showing: ' + (houseRel?.address || s.location || 'property'),
      description: s.notes || undefined,
      location: address,
      start,
      durationMinutes: s.duration_minutes ?? 60,
    });
  }

  // 3. Tour requests — include the house address as the location.
  const { data: tours } = await service
    .from('tour_requests')
    .select(
      `id, status, preferred_when, notes,
       house:houses ( id, address )`
    )
    .eq('search_id', rawId)
    .order('created_at', { ascending: true });

  for (const t of tours || []) {
    if ((t as any).status === 'cancelled') continue;
    const startInput = t.preferred_when ? new Date(t.preferred_when as string) : null;
    const houseRel = (t as any).house as
      | { id: string; address?: string | null }
      | null;
    events.push({
      uid: 'tour-' + t.id + '@realtor-portal',
      summary: 'Tour request: ' + (houseRel?.address || 'property'),
      description: t.notes || undefined,
      location: houseRel?.address || undefined,
      start: startInput,
      durationMinutes: 60,
    });
  }

  const body = buildCalendarFeed(calName, events);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${rawId}.ics"`,
      // Calendar clients poll this URL; refresh roughly every 10 minutes.
      'cache-control': 'public, max-age=600',
      'x-content-type-options': 'nosniff',
    },
  });
}

/** Constant-time compare of two base64url tokens; safe against length leaks. */
function tokensMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
