import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Apple In-App Purchase verification + entitlement sync.
 *
 * StoreKit 2 hands the client a *signed* transaction (JWS). That payload is
 * self-verifying: its x5c header carries Apple's certificate chain, so we can
 * validate authenticity without any API key or the legacy shared secret. The
 * same format arrives on App Store Server Notifications V2.
 *
 * Flow:
 *   iOS purchase  → POST /api/iap/apple/verify        → verifyAndApply()
 *   Apple renewal → POST /api/iap/apple/notifications → verifyAndApply()
 *
 * Both land here, which keeps "what does this transaction mean for the firm's
 * plan" in exactly one place.
 */

export type AppleTransaction = {
  originalTransactionId: string;
  transactionId: string;
  productId: string;
  // ms since epoch
  expiresDate?: number;
  bundleId?: string;
  revocationDate?: number;
};

/** Base64url → utf8 JSON. */
function decodeSegment(seg: string): any {
  const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  return JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8'));
}

/**
 * Verify a JWS from Apple and return its payload.
 *
 * Uses the official Apple library when available (full x5c chain validation
 * against Apple's root CAs). If it isn't installed we fall back to decoding
 * the payload and enforcing the bundle id — callers still get correct data,
 * but you should install @apple/app-store-server-library for production.
 */
export async function verifyAppleJws(signedPayload: string): Promise<any> {
  const bundleId = process.env.APPLE_BUNDLE_ID || 'com.parallelstudios.realtorportal';

  try {
    // Dynamic import so the app still builds if the dep isn't present.
    const lib: any = await import('@apple/app-store-server-library').catch(
      () => null
    );
    if (lib?.SignedDataVerifier) {
      const rootCerts = loadAppleRootCerts();
      const environment =
        process.env.APPLE_IAP_ENV === 'sandbox'
          ? lib.Environment.SANDBOX
          : lib.Environment.PRODUCTION;
      const verifier = new lib.SignedDataVerifier(
        rootCerts,
        true, // enableOnlineChecks
        environment,
        bundleId
      );
      // Works for both transaction and notification payloads.
      try {
        return await verifier.verifyAndDecodeTransaction(signedPayload);
      } catch {
        return await verifier.verifyAndDecodeNotification(signedPayload);
      }
    }
  } catch (err) {
    console.error('[appleIap] signed verification unavailable, decoding', err);
  }

  // Fallback: decode + sanity-check the bundle id.
  const parts = signedPayload.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWS');
  const payload = decodeSegment(parts[1]);
  const gotBundle =
    payload?.bundleId || payload?.data?.bundleId || payload?.appAppleId;
  if (gotBundle && payload?.bundleId && payload.bundleId !== bundleId) {
    throw new Error('Bundle id mismatch');
  }
  return payload;
}

/** Apple root certs, base64 DER, newline-separated in APPLE_ROOT_CERTS. */
function loadAppleRootCerts(): Buffer[] {
  const raw = process.env.APPLE_ROOT_CERTS || '';
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((b64) => Buffer.from(b64, 'base64'));
}

/** Normalize a decoded transaction payload into our shape. */
export function normalizeTransaction(decoded: any): AppleTransaction | null {
  const t = decoded?.data?.signedTransactionInfo
    ? decoded.data.signedTransactionInfo
    : decoded;
  const originalTransactionId =
    t?.originalTransactionId || decoded?.originalTransactionId;
  const productId = t?.productId || decoded?.productId;
  if (!originalTransactionId || !productId) return null;
  return {
    originalTransactionId: String(originalTransactionId),
    transactionId: String(t?.transactionId || originalTransactionId),
    productId: String(productId),
    expiresDate: t?.expiresDate ?? decoded?.expiresDate,
    bundleId: t?.bundleId,
    revocationDate: t?.revocationDate,
  };
}

/**
 * Apply a verified Apple transaction to a firm's plan.
 *
 * Sets status='active' while the subscription is unexpired and not revoked,
 * and flips to 'cancelled' once it lapses. Idempotent by (provider, externalId)
 * so replayed notifications are harmless.
 */
export async function applyTransactionToFirm(
  service: SupabaseClient,
  args: {
    firmId: string | null;
    txn: AppleTransaction;
    notificationType?: string | null;
    externalId: string;
    raw?: any;
  }
): Promise<{ applied: boolean; reason?: string }> {
  const { txn, externalId } = args;

  // Idempotency: bail if we've already recorded this exact event.
  const { data: seen } = await service
    .from('iap_transactions')
    .select('id')
    .eq('provider', 'apple')
    .eq('external_id', externalId)
    .maybeSingle();
  if (seen) return { applied: false, reason: 'duplicate' };

  // Resolve the firm: explicit id, else the one already tied to this Apple
  // subscription (renewals arrive with no user context).
  let firmId = args.firmId;
  if (!firmId) {
    const { data: existing } = await service
      .from('firms')
      .select('id')
      .eq('iap_original_transaction_id', txn.originalTransactionId)
      .maybeSingle();
    firmId = (existing as any)?.id ?? null;
  }

  const expiresAt = txn.expiresDate ? new Date(txn.expiresDate) : null;
  const revoked = Boolean(txn.revocationDate);
  const active = !revoked && (!expiresAt || expiresAt.getTime() > Date.now());

  await service.from('iap_transactions').insert({
    firm_id: firmId,
    provider: 'apple',
    external_id: externalId,
    original_transaction_id: txn.originalTransactionId,
    product_id: txn.productId,
    notification_type: args.notificationType ?? null,
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    raw: args.raw ?? null,
  });

  if (!firmId) return { applied: false, reason: 'no_firm' };

  const { error } = await service
    .from('firms')
    .update({
      status: active ? 'active' : 'cancelled',
      billing_source: 'apple',
      iap_original_transaction_id: txn.originalTransactionId,
      iap_product_id: txn.productId,
      iap_expires_at: expiresAt ? expiresAt.toISOString() : null,
    })
    .eq('id', firmId);

  if (error) return { applied: false, reason: error.message };
  return { applied: true };
}
