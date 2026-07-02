import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { resolveCaller } from '@/lib/bearerAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SHOWING STATUS - Bearer/cookie JSON API for the native mobile app.
 * Mirrors updateShowingStatusAction in admin/app/dashboard/clients/[id]/actions.ts.
 *
 * POST /api/showings/status  body { search_id, showing_id, status }
 *   status: scheduled | confirmed | completed | canceled
 *   → { ok:true } | { ok:false, error }
 */
const STATUSES = ['scheduled', 'confirmed', 'completed', 'canceled'];

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
        { ok: false, error: 'Only firm staff can update showings.' },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      search_id?: string;
      showing_id?: string;
      status?: string;
    };
    if (!body.search_id || !body.showing_id) {
      return NextResponse.json(
        { ok: false, error: 'Showing is required.' },
        { status: 400 }
      );
    }
    if (!STATUSES.includes(body.status || '')) {
      return NextResponse.json(
        { ok: false, error: 'Bad status.' },
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
      .select('id, search_id')
      .eq('id', body.showing_id)
      .maybeSingle();
    if (!existing || (existing as any).search_id !== body.search_id) {
      return NextResponse.json(
        { ok: false, error: 'Showing not on this deal.' },
        { status: 400 }
      );
    }

    const { error } = await service
      .from('showings')
      .update({ status: body.status })
      .eq('id', body.showing_id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    try {
      await service.from('activities').insert({
        firm_id: (deal as any).firm_id,
        search_id: body.search_id,
        actor_id: me.user_id,
        action: 'showing_' + body.status,
        target: body.showing_id,
      });
    } catch (e: any) {
      console.error('[/api/showings/status] activity failed', e?.message || e);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/showings/status]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
