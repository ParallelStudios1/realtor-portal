import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { resolveCaller } from '@/lib/bearerAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * UPDATE PARTICIPANT - Bearer/cookie JSON API for the native mobile app.
 * Mirrors updateParticipantAction in admin/app/dashboard/clients/[id]/actions.ts:
 * change role, fix name/email/phone, or flip visibility flags.
 *
 * POST /api/participants/update  body {
 *   search_id, participant_id,
 *   patch: { role?, name?, email?, phone?,
 *            can_view_documents?, can_view_financials?,
 *            can_view_messages?, can_view_dates? }
 * }
 *   → { ok:true, participant } | { ok:false, error }
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
        { ok: false, error: 'Only firm staff can edit parties.' },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      search_id?: string;
      participant_id?: string;
      patch?: Record<string, any>;
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

    const patch = body.patch || {};
    const update: Record<string, any> = {};
    if (patch.role !== undefined) update.role = patch.role;
    if (patch.name !== undefined) update.external_name = patch.name;
    if (patch.email !== undefined) update.external_email = patch.email;
    if (patch.phone !== undefined) update.external_phone = patch.phone;
    for (const k of [
      'can_view_documents',
      'can_view_financials',
      'can_view_messages',
      'can_view_dates',
    ]) {
      if (patch[k] !== undefined) update[k] = !!patch[k];
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Nothing to update.' },
        { status: 400 }
      );
    }

    const { data: updated, error } = await service
      .from('deal_participants')
      .update(update)
      .eq('id', body.participant_id)
      .eq('search_id', body.search_id)
      .select(
        'id, role, external_name, external_email, external_phone, can_view_documents, can_view_financials, can_view_messages, can_view_dates'
      )
      .single();
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    try {
      await service.from('activities').insert({
        firm_id: (deal as any).firm_id,
        search_id: body.search_id,
        actor_id: me.user_id,
        action: 'participant_updated',
        target:
          (updated as any).external_name || (updated as any).external_email || '',
      });
    } catch (e: any) {
      console.error('[/api/participants/update] activity failed', e?.message || e);
    }

    return NextResponse.json({ ok: true, participant: updated });
  } catch (err: any) {
    console.error('[/api/participants/update]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
