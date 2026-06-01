import { NextResponse, type NextRequest } from 'next/server';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { createDocusignEnvelope } from '@/lib/docusign';
import { logAudit } from '@/lib/audit';
import { notifyDealParticipants } from '@/lib/notify';

/**
 * Realtor kicks off a DocuSign envelope for a specific deal. We gather the
 * parties (client + co-realtor + attorney + listed participants), send them
 * all to DocuSign as signers/CCs, and save the envelope URL back on the deal.
 *
 * Body: { searchId, documentUrl, documentName? }
 *
 * Without DOCUSIGN_* env vars set, returns 503 with reason=no_config so the
 * UI can degrade to "paste link manually".
 */
export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me?.firm_id)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (me.role !== 'realtor' && me.role !== 'firm_admin' && me.role !== 'super_admin')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.searchId || !body?.documentUrl) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const service = getSupabaseServiceRoleClient();
  const { data: deal } = await service
    .from('client_searches')
    .select(
      `id, firm_id, attorney_email, attorney_name,
       client:users!client_searches_client_id_fkey ( full_name, email ),
       realtor:users!client_searches_realtor_id_fkey ( full_name, email )`
    )
    .eq('id', body.searchId)
    .eq('firm_id', me.firm_id)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: 'deal not found' }, { status: 404 });

  const d = deal as any;
  const { data: parts } = await service
    .from('deal_participants')
    .select('external_email, external_name, role')
    .eq('search_id', body.searchId);

  // Build recipient list. Client + realtor sign; everyone else is CC'd.
  const recipients: Array<{ name: string; email: string; role: 'signer' | 'cc' }> = [];
  if (d.client?.email)
    recipients.push({
      name: d.client.full_name || d.client.email,
      email: d.client.email,
      role: 'signer',
    });
  if (d.realtor?.email)
    recipients.push({
      name: d.realtor.full_name || d.realtor.email,
      email: d.realtor.email,
      role: 'signer',
    });
  if (d.attorney_email)
    recipients.push({
      name: d.attorney_name || d.attorney_email,
      email: d.attorney_email,
      role: 'cc',
    });
  for (const p of (parts as any[]) || []) {
    if (!p.external_email) continue;
    recipients.push({
      name: p.external_name || p.external_email,
      email: p.external_email,
      role: p.role === 'buyer' || p.role === 'seller' ? 'signer' : 'cc',
    });
  }

  const result = await createDocusignEnvelope({
    documentUrl: body.documentUrl,
    documentName: body.documentName,
    recipients,
    emailSubject: 'Please sign — ' + (body.documentName || 'real-estate document'),
    emailMessage: 'Sent via Realtor Portal.',
  });

  if (!result.ok && (result as any).skipped) {
    return NextResponse.json(
      {
        error:
          'DocuSign is not configured on this deployment. Paste the envelope URL manually instead.',
        skipped: true,
      },
      { status: 503 }
    );
  }
  if (!result.ok) {
    return NextResponse.json(
      { error: (result as any).error },
      { status: 502 }
    );
  }

  // Persist the envelope as a tracked row (status 'sent'). The webhook
  // (DocuSign Connect) and/or the on-demand poll will advance its status.
  // UNIQUE(provider, envelope_id) makes this idempotent if the same envelope
  // ever round-trips here twice.
  await service.from('esign_envelopes').upsert(
    {
      firm_id: me.firm_id,
      search_id: body.searchId,
      document_id: body.documentId ?? null,
      provider: 'docusign',
      envelope_id: result.envelopeId,
      envelope_url: result.envelopeUrl,
      status: 'sent',
      recipients: recipients,
      created_by: me.user_id,
    },
    { onConflict: 'provider,envelope_id' }
  );

  await service
    .from('client_searches')
    .update({ docusign_envelope_url: result.envelopeUrl })
    .eq('id', body.searchId);

  await logAudit({
    firmId: me.firm_id,
    searchId: body.searchId,
    actor: { userId: me.user_id, email: me.email, role: me.role },
    action: 'esign.sent',
    entityType: 'esign_envelope',
    entityId: result.envelopeId,
    summary:
      'Sent ' + (body.documentName || 'document') + ' for e-signature via DocuSign',
    metadata: {
      provider: 'docusign',
      envelope_id: result.envelopeId,
      recipient_count: recipients.length,
    },
  });

  await notifyDealParticipants({
    searchId: body.searchId,
    subject: 'Document sent for signature',
    text:
      'A document (' +
      (body.documentName || 'real-estate document') +
      ') has been sent for signature via DocuSign. Please check your email for the signing request.',
    excludeUserId: me.user_id,
  });

  return NextResponse.json({
    ok: true,
    envelopeId: result.envelopeId,
    envelopeUrl: result.envelopeUrl,
  });
}
