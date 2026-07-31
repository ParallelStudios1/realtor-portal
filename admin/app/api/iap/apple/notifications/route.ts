import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import {
  verifyAppleJws,
  normalizeTransaction,
  applyTransactionToFirm,
  decodeRenewalInfo,
} from '@/lib/appleIap';

/**
 * App Store Server Notifications V2 webhook.
 *
 * Apple POSTs { signedPayload } here for renewals, cancellations, refunds,
 * billing retries, and grace-period changes. Point App Store Connect at:
 *   https://realtorportal.parallelstudios.co/api/iap/apple/notifications
 *
 * Auth is the JWS signature itself — Apple signs the payload, so a forged
 * request fails verification. We always 200 on handled input so Apple stops
 * retrying; genuine failures return 500 so Apple retries later.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Notification types that should END access immediately.
const REVOKING = new Set(['REFUND', 'REVOKE']);

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const signed = body?.signedPayload;
  if (!signed || typeof signed !== 'string') {
    return NextResponse.json({ error: 'missing signedPayload' }, { status: 400 });
  }

  let decoded: any;
  try {
    decoded = await verifyAppleJws(signed);
  } catch (err: any) {
    console.error('[iap/notifications] verification failed', err);
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  const notificationType: string =
    decoded?.notificationType || decoded?.data?.notificationType || 'UNKNOWN';
  const notificationUUID: string =
    decoded?.notificationUUID || decoded?.data?.notificationUUID || '';

  // The transaction may be nested and itself signed.
  let txnSource: any = decoded;
  const signedTxn = decoded?.data?.signedTransactionInfo;
  if (typeof signedTxn === 'string') {
    try {
      txnSource = await verifyAppleJws(signedTxn);
    } catch {
      txnSource = decoded;
    }
  }

  const txn = normalizeTransaction(txnSource);
  if (!txn) {
    // Nothing actionable (e.g. TEST notification) — ack so Apple stops retrying.
    return NextResponse.json({ ok: true, ignored: notificationType });
  }

  // A refund/revoke has no future expiry — force it into the past so the
  // shared apply logic marks the firm cancelled.
  if (REVOKING.has(notificationType) && !txn.revocationDate) {
    txn.revocationDate = Date.now();
  }

  const service = getSupabaseServiceRoleClient();

  // DID_CHANGE_RENEWAL_PREF with subtype DOWNGRADE is how Apple tells us a
  // customer asked to switch to a cheaper plan. The switch takes effect at the
  // next renewal, not now, so this is the only place we learn about it.
  const renewal = await decodeRenewalInfo(decoded);

  try {
    const result = await applyTransactionToFirm(service, {
      firmId: null, // resolved from originalTransactionId
      txn,
      notificationType,
      externalId: notificationUUID
        ? 'notif:' + notificationUUID
        : 'txn:' + txn.transactionId,
      raw: decoded,
      renewal,
    });
    return NextResponse.json({ ok: true, type: notificationType, ...result });
  } catch (err: any) {
    console.error('[iap/notifications] apply failed', err);
    return NextResponse.json({ error: 'apply_failed' }, { status: 500 });
  }
}
