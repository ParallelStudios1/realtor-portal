import { NextResponse } from 'next/server';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import {
  verifyAppleJws,
  normalizeTransaction,
  applyTransactionToFirm,
} from '@/lib/appleIap';

/**
 * Called by the iOS app right after a successful StoreKit purchase or restore.
 *
 * Body: { signedTransaction: string }  // JWS from StoreKit 2
 *
 * We verify the signature server-side (never trust the client's word that a
 * purchase happened), then flip the caller's firm to an active plan.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const me = await getMe();
  if (!me?.firm_id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const signed = body?.signedTransaction;
  if (!signed || typeof signed !== 'string') {
    return NextResponse.json({ error: 'missing signedTransaction' }, { status: 400 });
  }

  let decoded: any;
  try {
    decoded = await verifyAppleJws(signed);
  } catch (err: any) {
    console.error('[iap/verify] signature verification failed', err);
    return NextResponse.json({ error: 'invalid_transaction' }, { status: 400 });
  }

  const txn = normalizeTransaction(decoded);
  if (!txn) {
    return NextResponse.json({ error: 'unrecognized_transaction' }, { status: 400 });
  }

  const service = getSupabaseServiceRoleClient();

  // Guard: don't let one Apple subscription entitle a second firm.
  const { data: owner } = await service
    .from('firms')
    .select('id')
    .eq('iap_original_transaction_id', txn.originalTransactionId)
    .maybeSingle();
  if (owner && (owner as any).id !== me.firm_id) {
    return NextResponse.json(
      { error: 'subscription_already_linked' },
      { status: 409 }
    );
  }

  const result = await applyTransactionToFirm(service, {
    firmId: me.firm_id,
    txn,
    externalId: 'txn:' + txn.transactionId,
    raw: decoded,
  });

  return NextResponse.json({
    ok: true,
    active: result.applied || result.reason === 'duplicate',
    expiresAt: txn.expiresDate ? new Date(txn.expiresDate).toISOString() : null,
  });
}
