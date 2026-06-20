import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * Attach a signing link to the deal.
 *
 * We do NOT integrate the DocuSign API (by product decision). Instead the
 * realtor creates the envelope in DocuSign (or any e-sign tool) themselves and
 * pastes the signing URL here, optionally tying it to a specific uploaded
 * document ("which document does this apply to?") and giving it a label.
 *
 * Each saved link becomes an esign_envelopes row so every party on the deal can
 * see and open it (participant read policy added in migration 0045). We also
 * mirror the most recent link onto client_searches.docusign_envelope_url for
 * the legacy "Open DocuSign" affordance at the top of the deal.
 *
 * Body: { searchId, envelopeUrl, documentId?, label? }
 */
export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me?.firm_id)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (
    me.role !== 'realtor' &&
    me.role !== 'firm_admin' &&
    me.role !== 'super_admin' &&
    me.role !== 'owner' &&
    me.role !== 'manager' &&
    me.role !== 'agent'
  )
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const url = (body?.envelopeUrl || '').trim();
  const label = (body?.label || '').trim() || null;
  const documentId = (body?.documentId || '').trim() || null;
  // Designated signers - who on the deal is supposed to sign this.
  const rawSigners = Array.isArray(body?.signers) ? body.signers : [];
  const signers = rawSigners
    .filter((s: any) => s && (s.key || s.name))
    .slice(0, 25)
    .map((s: any) => ({
      key: String(s.key || s.name).slice(0, 200),
      name: String(s.name || s.key).slice(0, 200),
      role: s.role ? String(s.role).slice(0, 80) : null,
      signed: false,
      signed_at: null as string | null,
    }));
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

  // If a document was named, confirm it belongs to this deal.
  let docId: string | null = null;
  if (documentId) {
    const { data: doc } = await service
      .from('documents')
      .select('id')
      .eq('id', documentId)
      .eq('search_id', body.searchId)
      .maybeSingle();
    docId = doc ? documentId : null;
  }

  const { data: inserted, error: insErr } = await service
    .from('esign_envelopes')
    .insert({
      firm_id: me.firm_id,
      search_id: body.searchId,
      document_id: docId,
      provider: 'manual',
      envelope_id: 'manual-' + randomUUID(),
      envelope_url: url,
      status: 'sent',
      recipients: { label, signers },
      created_by: me.user_id,
    })
    .select('id, envelope_id, envelope_url, document_id, status, created_at, recipients')
    .single();
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Mirror onto the deal for the legacy top-of-deal "Open DocuSign" link.
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
    summary: 'Attached a signing link to the deal',
    metadata: { manual: true, documentId: docId, label },
  });

  return NextResponse.json({ ok: true, envelope: inserted });
}
