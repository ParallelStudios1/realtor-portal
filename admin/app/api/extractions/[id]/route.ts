import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { resolveCaller } from '@/lib/bearerAuth';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * EXTRACTION CONFIRM/DISCARD - Bearer/cookie JSON API for the native mobile
 * app. Mirrors confirmExtractionAction / discardExtractionAction in
 * admin/app/dashboard/deals/[id]/extractionActions.ts: staged AI-extracted
 * contract dates only become real important_dates when a human confirms.
 *
 * PATCH /api/extractions/[id]  body
 *   { action: 'confirm', selectedDates: [{ label, date }] }
 *   { action: 'discard' }
 *   → { ok:true, inserted? } | { ok:false, error }
 */

const STAFF_ROLES = [
  'realtor',
  'firm_admin',
  'super_admin',
  'owner',
  'manager',
  'agent',
];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const me = await resolveCaller(req);
    if (!me?.user_id || !me.firm_id) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated.' },
        { status: 401 }
      );
    }
    if (!STAFF_ROLES.includes(me.role || '')) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden.' },
        { status: 403 }
      );
    }

    const service = getSupabaseServiceRoleClient();
    const { data: extraction } = await service
      .from('contract_extractions')
      .select('id, firm_id, search_id, document_id, status')
      .eq('id', params.id)
      .maybeSingle();
    if (!extraction) {
      return NextResponse.json(
        { ok: false, error: 'Extraction not found.' },
        { status: 404 }
      );
    }
    const ex = extraction as any;
    if (ex.firm_id !== me.firm_id && me.role !== 'super_admin') {
      return NextResponse.json(
        { ok: false, error: 'Forbidden.' },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      selectedDates?: { label: string; date: string }[];
    };

    if (body.action === 'discard') {
      if (ex.status === 'confirmed') {
        return NextResponse.json(
          {
            ok: false,
            error: 'This extraction was already confirmed and cannot be discarded.',
          },
          { status: 400 }
        );
      }
      const { error } = await service
        .from('contract_extractions')
        .update({ status: 'discarded' })
        .eq('id', ex.id);
      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }
      await service.from('activities').insert({
        firm_id: ex.firm_id,
        search_id: ex.search_id,
        actor_id: me.user_id,
        action: 'extraction_discarded',
        target: 'AI contract suggestions',
        metadata: { extraction_id: ex.id, document_id: ex.document_id },
      });
      await logAudit({
        firmId: ex.firm_id,
        searchId: ex.search_id,
        actor: { userId: me.user_id, email: me.email, role: me.role },
        action: 'extraction.discarded',
        entityType: 'contract_extraction',
        entityId: ex.id,
        summary: 'Discarded AI-extracted contract suggestions',
        metadata: { document_id: ex.document_id },
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action !== 'confirm') {
      return NextResponse.json(
        { ok: false, error: 'action must be confirm or discard.' },
        { status: 400 }
      );
    }
    if (ex.status === 'confirmed') {
      return NextResponse.json(
        { ok: false, error: 'This extraction has already been confirmed.' },
        { status: 400 }
      );
    }
    if (ex.status === 'discarded') {
      return NextResponse.json(
        { ok: false, error: 'This extraction was discarded.' },
        { status: 400 }
      );
    }

    const clean = (body.selectedDates || [])
      .map((d) => ({
        label: String(d?.label ?? '').trim(),
        date: String(d?.date ?? '').trim(),
      }))
      .filter((d) => d.label && ISO_DATE.test(d.date));
    if (clean.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Select at least one valid date to add.' },
        { status: 400 }
      );
    }

    const rows = clean.map((d) => ({
      firm_id: ex.firm_id,
      search_id: ex.search_id,
      label: d.label,
      date: d.date,
      notes: 'Added from AI contract extraction (human-confirmed)',
      created_by: me.user_id,
    }));
    const { error: insErr } = await service.from('important_dates').insert(rows);
    if (insErr) {
      return NextResponse.json(
        { ok: false, error: insErr.message || 'Could not save dates.' },
        { status: 500 }
      );
    }

    const { error: updErr } = await service
      .from('contract_extractions')
      .update({
        status: 'confirmed',
        confirmed_by: me.user_id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', ex.id);
    if (updErr) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Dates were added but the extraction status could not be updated: ' +
            updErr.message,
        },
        { status: 500 }
      );
    }

    await service.from('activities').insert({
      firm_id: ex.firm_id,
      search_id: ex.search_id,
      actor_id: me.user_id,
      action: 'extraction_confirmed',
      target: `${clean.length} contract date${clean.length === 1 ? '' : 's'}`,
      metadata: {
        extraction_id: ex.id,
        document_id: ex.document_id,
        count: clean.length,
      },
    });
    await logAudit({
      firmId: ex.firm_id,
      searchId: ex.search_id,
      actor: { userId: me.user_id, email: me.email, role: me.role },
      action: 'extraction.confirmed',
      entityType: 'contract_extraction',
      entityId: ex.id,
      summary: `Confirmed ${clean.length} AI-extracted contract date(s)`,
      metadata: { document_id: ex.document_id, count: clean.length },
    });

    return NextResponse.json({ ok: true, inserted: clean.length });
  } catch (err: any) {
    console.error('[/api/extractions/[id]]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
