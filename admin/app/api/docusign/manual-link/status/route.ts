import { NextResponse, type NextRequest } from 'next/server';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

/**
 * Manually update a signing link's status (we don't poll DocuSign). Staff only.
 * Body: { envelopeId, status }  status ∈ sent|completed|declined|voided
 */
const ALLOWED = ['sent', 'completed', 'declined', 'voided'] as const;

export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me?.firm_id)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (
    !['realtor', 'firm_admin', 'super_admin', 'owner', 'manager', 'agent'].includes(
      me.role || ''
    )
  )
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const envelopeId = (body?.envelopeId || '').trim();
  const status = (body?.status || '').trim();
  if (!envelopeId || !ALLOWED.includes(status as any)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const service = getSupabaseServiceRoleClient();
  const { error } = await service
    .from('esign_envelopes')
    .update({
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('envelope_id', envelopeId)
    .eq('firm_id', me.firm_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
