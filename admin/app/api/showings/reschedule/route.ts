import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { resolveCaller } from '@/lib/bearerAuth';
import { notifyDealParticipants } from '@/lib/notify';
import { escapeHtml } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * RESCHEDULE SHOWING - Bearer/cookie JSON API for the native mobile app.
 * Mirrors rescheduleShowingAction in admin/app/dashboard/clients/[id]/actions.ts.
 *
 * POST /api/showings/reschedule  body {
 *   search_id, showing_id, scheduled_at (ISO),
 *   duration_minutes?, location?, notes?
 * }
 *   → { ok:true } | { ok:false, error }
 */
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
        { ok: false, error: 'Only firm staff can reschedule showings.' },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      search_id?: string;
      showing_id?: string;
      scheduled_at?: string;
      duration_minutes?: number;
      location?: string | null;
      notes?: string | null;
    };
    if (!body.search_id || !body.showing_id || !body.scheduled_at) {
      return NextResponse.json(
        { ok: false, error: 'Showing and new time are required.' },
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

    const service = getSupabaseServiceRoleClient();
    const { data: deal } = await service
      .from('client_searches')
      .select('id, firm_id')
      .eq('id', body.search_id)
      .maybeSingle();
    if (!deal || (deal as any).firm_id !== me.firm_id) {
      return NextResponse.json(
        { ok: false, error: 'You do not have access to this deal.' },
        { status: 403 }
      );
    }
    const { data: existing } = await service
      .from('showings')
      .select('id, search_id, house_id')
      .eq('id', body.showing_id)
      .maybeSingle();
    if (!existing || (existing as any).search_id !== body.search_id) {
      return NextResponse.json(
        { ok: false, error: 'Showing not on this deal.' },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = {
      scheduled_at: when.toISOString(),
      status: 'scheduled',
    };
    if (typeof body.duration_minutes === 'number')
      updates.duration_minutes = Math.max(5, Math.min(480, body.duration_minutes));
    if (body.location !== undefined)
      updates.location = body.location?.trim() || null;
    if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;

    const { error } = await service
      .from('showings')
      .update(updates)
      .eq('id', body.showing_id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    let address = '';
    if ((existing as any).house_id) {
      const { data: house } = await service
        .from('houses')
        .select('address')
        .eq('id', (existing as any).house_id)
        .maybeSingle();
      address = (house as any)?.address || '';
    }

    try {
      await service.from('activities').insert({
        firm_id: (deal as any).firm_id,
        search_id: body.search_id,
        actor_id: me.user_id,
        action: 'showing_rescheduled',
        target: address || when.toLocaleString(),
        metadata: { showing_id: body.showing_id, scheduled_at: when.toISOString() },
      });
    } catch (e: any) {
      console.error('[/api/showings/reschedule] activity failed', e?.message || e);
    }

    try {
      const siteUrl =
        process.env.SITE_URL || 'https://realtorportal.parallelstudios.co';
      const dealUrl = siteUrl + '/deal/' + body.search_id;
      const pretty =
        when.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }) +
        ' @ ' +
        when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      await notifyDealParticipants({
        searchId: body.search_id,
        subject: address
          ? `Showing rescheduled: ${address} on ${pretty}`
          : `Showing rescheduled on ${pretty}`,
        text:
          'The showing has been moved to:\n\n' +
          (address ? address + '\n' : '') +
          pretty +
          '\n\nOpen the deal: ' +
          dealUrl,
        html:
          `<p><strong>The showing has been moved to:</strong></p>` +
          (address ? `<p>${escapeHtml(address)}</p>` : '') +
          `<p>${escapeHtml(pretty)}</p>` +
          `<p><a href="${dealUrl}">Open the deal &rarr;</a></p>`,
        sms_text:
          'Showing moved' +
          (address ? ': ' + address : '') +
          ' - ' +
          pretty +
          ' - ' +
          dealUrl,
        excludeUserId: me.user_id,
      });
    } catch (e: any) {
      console.error('[/api/showings/reschedule] notify failed', e?.message || e);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/showings/reschedule]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
