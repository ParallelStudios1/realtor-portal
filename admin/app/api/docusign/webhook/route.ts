import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { normalizeDocusignStatus } from '@/lib/docusign';
import { logAudit } from '@/lib/audit';
import { notifyDealParticipants } from '@/lib/notify';

export const runtime = 'nodejs';
// We must read the raw request body to verify the HMAC, so opt out of any
// body parsing/caching.
export const dynamic = 'force-dynamic';

/**
 * DocuSign Connect webhook.
 *
 * DocuSign POSTs envelope status changes here. Each request is signed: the
 * HMAC-SHA256 of the *raw* request body (keyed with the account's Connect
 * HMAC secret) is sent base64-encoded in one or more `X-DocuSign-Signature-N`
 * headers (it rotates keys, so several may be present - any match passes).
 *
 * We accept both the modern JSON Connect payload and the older XML payload,
 * but we only require enough of it to find the envelopeId + status.
 *
 * Behaviour:
 *   - DOCUSIGN_CONNECT_HMAC_KEY unset  → 503 clear JSON (never silently 200).
 *   - Signature mismatch               → 401 JSON.
 *   - Unknown envelope                 → 200 JSON { ok:true, matched:false }
 *     (we don't want DocuSign to retry forever for envelopes we don't track).
 *   - On completed/declined           → notifyDealParticipants + logAudit.
 *
 * Always returns JSON.
 */

function verifyHmac(rawBody: string, headers: Headers, secret: string): boolean {
  // DocuSign computes HMAC-SHA256 over the raw bytes, base64-encoded.
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  // Collect every X-DocuSign-Signature-N header (key rotation → multiple).
  const candidates: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const v = headers.get('x-docusign-signature-' + i);
    if (v) candidates.push(v.trim());
  }
  if (candidates.length === 0) return false;

  const expBuf = Buffer.from(expected);
  for (const cand of candidates) {
    const candBuf = Buffer.from(cand);
    if (
      candBuf.length === expBuf.length &&
      crypto.timingSafeEqual(candBuf, expBuf)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Pull (envelopeId, status, completedAt) out of whatever Connect shape we got.
 * Supports the modern aggregate JSON (`data.envelopeSummary` / `data.envelopeId`),
 * a flat JSON, and a minimal XML fallback.
 */
function parsePayload(raw: string, contentType: string): {
  envelopeId: string | null;
  status: string | null;
  completedAt: string | null;
  recipients: any;
} {
  const out = {
    envelopeId: null as string | null,
    status: null as string | null,
    completedAt: null as string | null,
    recipients: null as any,
  };

  if (contentType.includes('xml') || raw.trimStart().startsWith('<')) {
    const idMatch = raw.match(/<EnvelopeID>([^<]+)<\/EnvelopeID>/i);
    const statusMatch = raw.match(/<Status>([^<]+)<\/Status>/i);
    const completedMatch = raw.match(/<Completed>([^<]+)<\/Completed>/i);
    out.envelopeId = idMatch ? idMatch[1].trim() : null;
    out.status = statusMatch ? statusMatch[1].trim() : null;
    out.completedAt = completedMatch ? completedMatch[1].trim() : null;
    return out;
  }

  let json: any = null;
  try {
    json = JSON.parse(raw);
  } catch {
    return out;
  }

  // Modern Connect "Envelope" event: { event, data: { envelopeId, envelopeSummary } }
  const data = json?.data ?? json;
  const summary = data?.envelopeSummary ?? data;

  out.envelopeId =
    data?.envelopeId ??
    summary?.envelopeId ??
    json?.envelopeId ??
    null;
  out.status =
    summary?.status ??
    data?.status ??
    json?.status ??
    null;
  out.completedAt =
    summary?.completedDateTime ??
    data?.completedDateTime ??
    null;
  out.recipients = summary?.recipients ?? data?.recipients ?? null;

  return out;
}

export async function POST(req: NextRequest) {
  const secret = process.env.DOCUSIGN_CONNECT_HMAC_KEY;
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'DocuSign Connect is not configured on this deployment (DOCUSIGN_CONNECT_HMAC_KEY unset).',
        skipped: true,
      },
      { status: 503 }
    );
  }

  // Read the raw body for HMAC verification.
  const rawBody = await req.text();

  if (!verifyHmac(rawBody, req.headers, secret)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid signature.' },
      { status: 401 }
    );
  }

  const contentType = (req.headers.get('content-type') || '').toLowerCase();
  const { envelopeId, status, completedAt, recipients } = parsePayload(
    rawBody,
    contentType
  );

  if (!envelopeId) {
    return NextResponse.json(
      { ok: true, matched: false, reason: 'no_envelope_id' },
      { status: 200 }
    );
  }

  const normalized = normalizeDocusignStatus(status);
  const service = getSupabaseServiceRoleClient();

  // Find the tracked envelope so we have firm/search context for notify+audit.
  const { data: existing } = await service
    .from('esign_envelopes')
    .select('id, firm_id, search_id, status')
    .eq('provider', 'docusign')
    .eq('envelope_id', envelopeId)
    .maybeSingle();

  if (!existing) {
    // We don't track this envelope; ack so DocuSign stops retrying.
    return NextResponse.json(
      { ok: true, matched: false, reason: 'unknown_envelope' },
      { status: 200 }
    );
  }

  const update: Record<string, any> = {
    status: normalized,
    updated_at: new Date().toISOString(),
  };
  if (recipients != null) update.recipients = recipients;
  if (normalized === 'completed') {
    update.completed_at = completedAt || new Date().toISOString();
  }

  await service
    .from('esign_envelopes')
    .update(update)
    .eq('id', (existing as any).id);

  // Keep client_searches in sync only when it reaches a terminal-ish state -
  // the envelope URL was already set at send time, so nothing to change here.

  const wasTerminal =
    normalized === 'completed' || normalized === 'declined';
  const statusChanged = (existing as any).status !== normalized;

  if (wasTerminal && statusChanged) {
    const searchId = (existing as any).search_id as string;
    const firmId = (existing as any).firm_id as string;

    await logAudit({
      firmId,
      searchId,
      actor: null,
      action: normalized === 'completed' ? 'esign.completed' : 'esign.declined',
      entityType: 'esign_envelope',
      entityId: envelopeId,
      summary:
        normalized === 'completed'
          ? 'E-signature envelope completed (all parties signed)'
          : 'E-signature envelope was declined',
      metadata: { provider: 'docusign', envelope_id: envelopeId },
    });

    if (searchId) {
      await notifyDealParticipants({
        searchId,
        subject:
          normalized === 'completed'
            ? 'Document fully signed'
            : 'Signature request declined',
        text:
          normalized === 'completed'
            ? 'All parties have signed the document. The signed copy is now on file.'
            : 'A signature request was declined. Please review the deal and follow up.',
      });
    }
  }

  return NextResponse.json({ ok: true, matched: true, status: normalized });
}
