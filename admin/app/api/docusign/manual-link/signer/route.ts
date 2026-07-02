import { NextResponse, type NextRequest } from 'next/server';
import { resolveCaller } from '@/lib/bearerAuth';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

/**
 * Toggle a single designated signer's "signed" state on a signing link. Staff
 * only. When every designated signer has signed, the envelope auto-completes.
 *
 * Body: { envelopeId, signerKey, signed }
 *   envelopeId - esign_envelopes.envelope_id
 *   signerKey  - the signer's key inside recipients.signers
 *   signed     - boolean
 */
export async function POST(req: NextRequest) {
  const me = await resolveCaller(req);
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
  const signerKey = (body?.signerKey || '').trim();
  const signed = !!body?.signed;
  if (!envelopeId || !signerKey) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const service = getSupabaseServiceRoleClient();
  const { data: env, error: getErr } = await service
    .from('esign_envelopes')
    .select('id, recipients, status')
    .eq('envelope_id', envelopeId)
    .eq('firm_id', me.firm_id)
    .maybeSingle();
  if (getErr || !env) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Normalize recipients into { label, signers[] }.
  const rec: any = (env as any).recipients;
  const label = Array.isArray(rec) ? rec.find((r) => r?.label)?.label : rec?.label;
  const signers: any[] = Array.isArray(rec)
    ? rec.filter((r) => r?.key || r?.name)
    : Array.isArray(rec?.signers)
      ? rec.signers
      : [];

  let found = false;
  const now = new Date().toISOString();
  const nextSigners = signers.map((s) => {
    if (s.key === signerKey || s.name === signerKey) {
      found = true;
      return { ...s, signed, signed_at: signed ? now : null };
    }
    return s;
  });
  if (!found) {
    return NextResponse.json({ error: 'signer not found' }, { status: 404 });
  }

  // Auto-complete when every designated signer has signed.
  const allSigned =
    nextSigners.length > 0 && nextSigners.every((s) => s.signed);
  const status =
    (env as any).status === 'voided' || (env as any).status === 'declined'
      ? (env as any).status
      : allSigned
        ? 'completed'
        : 'sent';

  const { error: upErr } = await service
    .from('esign_envelopes')
    .update({
      recipients: { label: label ?? null, signers: nextSigners },
      status,
      completed_at: allSigned ? now : null,
      updated_at: now,
    })
    .eq('id', (env as any).id);
  if (upErr)
    return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, allSigned });
}
