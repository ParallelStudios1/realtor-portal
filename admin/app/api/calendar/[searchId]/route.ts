import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { buildCalendarFeed, type IcsEvent } from '@/lib/ics';

export const dynamic = 'force-dynamic';
// 30 second edge cache — clients refresh every ~10 min anyway.
export const revalidate = 30;

/**
 * Public read-only calendar feed for a single client_searches deal.
 *
 * URL: /api/calendar/{searchId}.ics
 *   (the .ics suffix is stripped; we accept both with and without)
 *
 * Authentication: by-UUID-knowledge. The searchId is an unguessable v4 UUID
 * and the feed contains only milestone dates + the property address — no
 * documents, no messages, no PII beyond the address. This trades a small
 * amount of privacy for the massive UX win of webcal:// subscription with
 * zero auth flow inside Apple/Google Calendar.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { searchId: string } }
) {
  const rawId = params.searchId.replace(/\.ics$/, '');
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      rawId
    );
  if (!isUuid) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
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
    .select('id, label, date, kind')
    .eq('search_id', rawId)
    .order('date', { ascending: true });

  for (const d of dates || []) {
    if (!d.date) continue;
    // Use 9am local-as-UTC for all-day-ish dates. Calendar apps show this
    // as "9am on the day" which matches client expectations.
    const start = new Date(d.date);
    if (isNaN(start.getTime())) continue;
    start.setUTCHours(13, 0, 0, 0); // 13 UTC ~ 9am ET / 6am PT (good middle ground)
    events.push({
      uid: 'date-' + d.id + '@realtor-portal',
      summary: d.label || 'Important date',
      description: 'Type: ' + (d.kind || 'custom'),
      start,
      durationMinutes: 60,
    });
  }

  // 2. Confirmed tours — include the house address as the location.
  const { data: tours } = await service
    .from('tour_requests')
    .select(
      `id, status, preferred_when, notes,
       house:houses ( id, address, list_price )`
    )
    .eq('search_id', rawId)
    .eq('status', 'confirmed')
    .order('preferred_when', { ascending: true });

  for (const t of tours || []) {
    const startInput = t.preferred_when ? new Date(t.preferred_when) : null;
    const houseRel = (t as any).house as
      | { id: string; address?: string | null; list_price?: number | null }
      | null;
    events.push({
      uid: 'tour-' + t.id + '@realtor-portal',
      summary: 'Tour: ' + (houseRel?.address || 'house'),
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
      // Calendar clients respect these — refresh ~10 min.
      'cache-control': 'public, max-age=600',
      'x-content-type-options': 'nosniff',
    },
  });
}
