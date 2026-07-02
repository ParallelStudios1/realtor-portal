import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { resolveCaller } from '@/lib/bearerAuth';
import { notifyDealParticipants } from '@/lib/notify';
import { escapeHtml } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SCHEDULE SHOWING - Bearer/cookie JSON API for the native mobile app.
 *
 * Mirrors scheduleShowingAction in
 *   admin/app/dashboard/clients/[id]/actions.ts
 * (web performs this write via a server action, so mobile gets this route).
 *
 * POST /api/showings/schedule
 *   body {
 *     search_id: string,
 *     house_id?: string | null,
 *     scheduled_at: string,          // ISO timestamp
 *     duration_minutes?: number,     // clamped 5..480, default 30
 *     location?: string | null,
 *     attendees?: { name?, email?, phone? }[],
 *     notes?: string | null
 *   }
 *   → { ok:true, showingId } on success
 *   → { ok:false, error } otherwise
 *
 * Authorize: firm staff (role not client/attorney) on the deal's host firm -
 * same check as /api/dates/complete. Side effects match the server action:
 * important_dates mirror, activity row, email+SMS to everyone on the deal.
 */

type Body = {
  search_id?: string;
  house_id?: string | null;
  scheduled_at?: string;
  duration_minutes?: number;
  location?: string | null;
  attendees?: Array<{
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  }>;
  notes?: string | null;
};

export async function POST(req: Request) {
  try {
    const me = await resolveCaller(req);
    if (!me?.user_id || !me.firm_id) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated.' },
        { status: 401 }
      );
    }
    const staff = me.role && !['client', 'attorney'].includes(me.role);
    if (!staff) {
      return NextResponse.json(
        { ok: false, error: 'Only firm staff can schedule showings.' },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const searchId = (body.search_id || '').trim();
    if (!searchId) {
      return NextResponse.json(
        { ok: false, error: 'Deal is required.' },
        { status: 400 }
      );
    }
    if (!body.scheduled_at) {
      return NextResponse.json(
        { ok: false, error: 'A date and time is required.' },
        { status: 400 }
      );
    }
    const when = new Date(body.scheduled_at);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json(
        { ok: false, error: 'That date/time is not valid.' },
        { status: 400 }
      );
    }
    const duration = Math.max(5, Math.min(480, body.duration_minutes || 30));

    const service = getSupabaseServiceRoleClient();
    const { data: deal } = await service
      .from('client_searches')
      .select('id, firm_id')
      .eq('id', searchId)
      .maybeSingle();
    if (!deal) {
      return NextResponse.json(
        { ok: false, error: 'Deal not found.' },
        { status: 404 }
      );
    }
    if ((deal as any).firm_id !== me.firm_id) {
      return NextResponse.json(
        { ok: false, error: 'You do not have access to this deal.' },
        { status: 403 }
      );
    }

    // Resolve the house (for the address used in the title + important_dates).
    let address = '';
    if (body.house_id) {
      const { data: house } = await service
        .from('houses')
        .select('id, address, search_id')
        .eq('id', body.house_id)
        .maybeSingle();
      if (!house || (house as any).search_id !== searchId) {
        return NextResponse.json(
          { ok: false, error: 'House not on this deal.' },
          { status: 400 }
        );
      }
      address = (house as any).address || '';
    }

    const attendees = Array.isArray(body.attendees)
      ? body.attendees
          .map((p) => ({
            name: p?.name?.trim() || null,
            email: p?.email?.trim() || null,
            phone: p?.phone?.trim() || null,
          }))
          .filter((p) => p.name || p.email || p.phone)
      : [];

    const { data: row, error } = await service
      .from('showings')
      .insert({
        search_id: searchId,
        firm_id: (deal as any).firm_id,
        house_id: body.house_id || null,
        scheduled_at: when.toISOString(),
        duration_minutes: duration,
        location: body.location?.trim() || address || null,
        attendees,
        status: 'scheduled',
        notes: body.notes?.trim() || null,
        created_by: me.user_id,
      })
      .select('id')
      .single();
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const label = address ? 'Showing: ' + address : 'Showing';

    // Mirror into important_dates so the calendar export / dates card picks
    // it up alongside everything else (non-fatal, same as the server action).
    const datePart = when.toISOString().slice(0, 10);
    const timePart = when.toISOString().slice(11, 19);
    try {
      await service.from('important_dates').insert({
        firm_id: (deal as any).firm_id,
        search_id: searchId,
        label,
        date: datePart,
        event_time: timePart,
        location: body.location?.trim() || address || null,
        notes: 'showing',
        created_by: me.user_id,
      });
    } catch (e: any) {
      console.error(
        '[/api/showings/schedule] important_dates mirror failed',
        e?.message || e
      );
    }

    // Activity row (best effort).
    try {
      await service.from('activities').insert({
        firm_id: (deal as any).firm_id,
        search_id: searchId,
        actor_id: me.user_id,
        action: 'showing_scheduled',
        target: address || when.toLocaleString(),
        metadata: {
          showing_id: (row as any)?.id,
          scheduled_at: when.toISOString(),
          duration_minutes: duration,
        },
      });
    } catch (e: any) {
      console.error('[/api/showings/schedule] activity failed', e?.message || e);
    }

    // Email + SMS everyone on the deal (best effort).
    try {
      const siteUrl =
        process.env.SITE_URL || 'https://realtorportal.parallelstudios.co';
      const dealUrl = siteUrl + '/deal/' + searchId;
      const pretty =
        when.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }) +
        ' @ ' +
        when.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        });
      const where = body.location?.trim() || address;
      const subject = address
        ? `Showing scheduled: ${address} on ${pretty}`
        : `Showing scheduled on ${pretty}`;
      await notifyDealParticipants({
        searchId,
        subject,
        text:
          'A showing has been scheduled:\n\n' +
          (address ? address + '\n' : '') +
          pretty +
          ' (' +
          duration +
          ' min)' +
          (where ? '\nLocation: ' + where : '') +
          (body.notes ? '\nNotes: ' + body.notes : '') +
          '\n\nOpen the deal: ' +
          dealUrl,
        html:
          `<p><strong>A showing has been scheduled:</strong></p>` +
          (address ? `<p>${escapeHtml(address)}</p>` : '') +
          `<p>${escapeHtml(pretty)} (${duration} min)</p>` +
          (where ? `<p><strong>Location:</strong> ${escapeHtml(where)}</p>` : '') +
          (body.notes
            ? `<p><strong>Notes:</strong> ${escapeHtml(body.notes)}</p>`
            : '') +
          `<p><a href="${dealUrl}">Open the deal &rarr;</a></p>`,
        sms_text:
          'Showing scheduled' +
          (address ? ': ' + address : '') +
          ' - ' +
          pretty +
          ' - ' +
          dealUrl,
        excludeUserId: me.user_id,
      });
    } catch (e: any) {
      console.error('[/api/showings/schedule] notify failed', e?.message || e);
    }

    return NextResponse.json({ ok: true, showingId: (row as any)?.id });
  } catch (err: any) {
    console.error('[/api/showings/schedule]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
