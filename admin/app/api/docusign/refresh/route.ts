import { NextResponse, type NextRequest } from 'next/server';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { getEnvelopeStatus } from '@/lib/docusign';
import { logAudit } from '@/lib/audit';
import { notifyDealParticipants } from '@/lib/notify';

export const runtime = 'nodejs';

/**
 * On-demand status poll for a tracked envelope. This is the fallback for
 * deployments where DocuSign Connect (the push webhook) is not configured:
 * the realtor clicks "Refresh status" and we pull the current status straight
 * from DocuSign and persist it.
 *
 * Body: { envelopeId }
 *
 * Soft-skips with 503 when DOCUSIGN_* env vars are unset.
 */
export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me?.firm_id)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (me.role !== 'realtor' && me.role !== 'firm_admin' && me.role !== 'super_admin')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.envelopeId) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const service = getSupabaseServiceRoleClient();
  const { data: row } = await service
    .from('esign_envelopes')
    .select('id, firm_id, search_id, status')
    .eq('provider', 'docusign')
    .eq('envelope_id', body.envelopeId)
    .eq('firm_id', me.firm_id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const result = await getEnvelopeStatus(body.envelopeId);
  if (!result.ok && (result as any).skipped) {
    return NextResponse.json(
      {
        error:
          'DocuSign is not configured on this deployment. Status updates arrive via webhook or manual entry.',
        skipped: true,
      },
      { status: 503 }
    );
  }
  if (!result.ok) {
    return NextResponse.json({ error: (result as any).error }, { status: 502 });
  }

  const update: Record<string, any> = {
    status: result.status,
    updated_at: new Date().toISOString(),
  };
  if (result.recipients != null) update.recipients = result.recipients;
  if (result.status === 'completed') {
    update.completed_at = result.completedAt || new Date().toISOString();
  }

  await service.from('esign_envelopes').update(update).eq('id', (row as any).id);

  const wasTerminal = result.status === 'completed' || result.status === 'declined';
  const statusChanged = (row as any).status !== result.status;
  if (wasTerminal && statusChanged) {
    await logAudit({
      firmId: (row as any).firm_id,
      searchId: (row as any).search_id,
      actor: { userId: me.user_id, email: me.email, role: me.role },
      action: result.status === 'completed' ? 'esign.completed' : 'esign.declined',
      entityType: 'esign_envelope',
      entityId: body.envelopeId,
      summary:
        result.status === 'completed'
          ? 'E-signature envelope completed (all parties signed)'
          : 'E-signature envelope was declined',
      metadata: { provider: 'docusign', envelope_id: body.envelopeId, via: 'poll' },
    });
    if ((row as any).search_id) {
      await notifyDealParticipants({
        searchId: (row as any).search_id,
        subject:
          result.status === 'completed'
            ? 'Document fully signed'
            : 'Signature request declined',
        text:
          result.status === 'completed'
            ? 'All parties have signed the document. The signed copy is now on file.'
            : 'A signature request was declined. Please review the deal and follow up.',
        excludeUserId: me.user_id,
      });
    }
  }

  return NextResponse.json({ ok: true, status: result.status });
}
