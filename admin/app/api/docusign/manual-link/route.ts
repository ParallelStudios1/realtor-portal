import { NextResponse, type NextRequest } from 'next/server';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * Manual fallback used when DocuSign is NOT configured on this deployment.
 * The realtor signs the document in DocuSign by hand, then pastes the
 * envelope URL here. We record it on client_searches.docusign_envelope_url
 * (the legacy "Open DocuSign" affordance) so the link is available on the deal.
 *
 * Body: { searchId, envelopeUrl }
 */
export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me?.firm_id)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (me.role !== 'realtor' && me.role !== 'firm_admin' && me.role !== 'super_admin')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const url = (body?.envelopeUrl || '').trim();
  if (!body?.searchId || !url) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: 'Enter a full https:// URL.' },
      { status: 400 }
    );
  }

  const service = getSupabaseServiceRoleClient();
  const { data: deal } = await service
    .from('client_searches')
    .select('id')
    .eq('id', body.searchId)
    .eq('firm_id', me.firm_id)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: 'deal not found' }, { status: 404 });

  await service
    .from('client_searches')
    .update({ docusign_envelope_url: url })
    .eq('id', body.searchId);

  await logAudit({
    firmId: me.firm_id,
    searchId: body.searchId,
    actor: { userId: me.user_id, email: me.email, role: me.role },
    action: 'esign.linked',
    entityType: 'client_search',
    entityId: body.searchId,
    summary: 'Manually linked a DocuSign envelope URL to the deal',
    metadata: { manual: true },
  });

  return NextResponse.json({ ok: true, envelopeUrl: url });
}
