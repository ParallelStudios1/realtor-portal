import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { resolveCaller } from '@/lib/bearerAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * REMOVE PARTICIPANT - Bearer/cookie JSON API for the native mobile app.
 * Mirrors removeParticipantAction in admin/app/dashboard/clients/[id]/actions.ts.
 *
 * POST /api/participants/remove  body { search_id, participant_id }
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
        { ok: false, error: 'Only firm staff can remove parties.' },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      search_id?: string;
      participant_id?: string;
    };
    if (!body.search_id || !body.participant_id) {
      return NextResponse.json(
        { ok: false, error: 'Participant is required.' },
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

    const { error } = await service
      .from('deal_participants')
      .delete()
      .eq('id', body.participant_id)
      .eq('search_id', body.search_id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/participants/remove]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
