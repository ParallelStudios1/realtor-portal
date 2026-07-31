import type { SupabaseClient } from '@supabase/supabase-js';
import { tierFromAppleProductId } from './plans';

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

/**
 * Apple's published root CAs. Fetched over TLS from apple.com (which
 * authenticates them) and cached for the life of the lambda. An operator can
 * pre-seed APPLE_ROOT_CERTS with base64 DER to skip the network entirely.
 */
const APPLE_ROOT_CERT_URLS = [
  'https://www.apple.com/certificateauthority/AppleRootCA-G3.cer',
  'https://www.apple.com/certificateauthority/AppleRootCA-G2.cer',
];

let cachedRoots: Buffer[] | null = null;

async function getAppleRootCerts(): Promise<Buffer[]> {
  if (cachedRoots && cachedRoots.length) return cachedRoots;

  const fromEnv = (process.env.APPLE_ROOT_CERTS || '')
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((b64) => Buffer.from(b64, 'base64'));
  if (fromEnv.length) {
    cachedRoots = fromEnv;
    return cachedRoots;
  }

  const fetched: Buffer[] = [];
  for (const url of APPLE_ROOT_CERT_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      fetched.push(Buffer.from(await res.arrayBuffer()));
    } catch (err) {
      console.error('[appleIap] root cert fetch failed', url, err);
    }
  }
  if (fetched.length) cachedRoots = fetched;
  return fetched;
}

/**
 * Verify a JWS from Apple and return its decoded payload.
 *
 * FAILS CLOSED. If the signature cannot be cryptographically verified against
 * Apple's root CAs this throws — we never fall back to merely decoding the
 * payload, because an unverified transaction is attacker-controlled and would
 * let anyone grant themselves a paid plan.
 *
 * Tries the Production environment first, then Sandbox: TestFlight and
 * simulator purchases are Sandbox transactions, so a production-only verifier
 * would reject every test purchase.
 */
export async function verifyAppleJws(signedPayload: string): Promise<any> {
  const bundleId = process.env.APPLE_BUNDLE_ID || 'com.parallelstudios.realtorportal';

  const lib: any = await import('@apple/app-store-server-library').catch(
    () => null
  );
  if (!lib?.SignedDataVerifier) {
    throw new Error(
      'Apple signature verification unavailable (@apple/app-store-server-library missing)'
    );
  }

  const rootCerts = await getAppleRootCerts();
  if (!rootCerts.length) {
    throw new Error('Apple root certificates unavailable; refusing to verify');
  }

  // appAppleId is only required for the Production environment.
  const appAppleId = process.env.APPLE_APP_APPLE_ID
    ? Number(process.env.APPLE_APP_APPLE_ID)
    : undefined;

  const environments = [lib.Environment.PRODUCTION, lib.Environment.SANDBOX];
  let lastErr: unknown = null;

  for (const environment of environments) {
    let verifier: any;
    try {
      verifier = new lib.SignedDataVerifier(
        rootCerts,
        true, // enableOnlineChecks (OCSP)
        environment,
        bundleId,
        environment === lib.Environment.PRODUCTION ? appAppleId : undefined
      );
    } catch (err) {
      lastErr = err;
      continue;
    }
    // A payload is either a signed transaction or a server notification.
    try {
      return await verifier.verifyAndDecodeTransaction(signedPayload);
    } catch (err) {
      lastErr = err;
    }
    try {
      return await verifier.verifyAndDecodeNotification(signedPayload);
    } catch (err) {
      lastErr = err;
    }
  }

  console.error('[appleIap] JWS verification failed', lastErr);
  throw new Error('Apple transaction signature verification failed');
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

  // Map the purchased product to a plan tier. This is what actually grants the
  // seat cap and feature flags the subscription advertises — without it a
  // Brokerage buyer would stay on the Starter seat limit.
  const tier = tierFromAppleProductId(txn.productId);

  const update: Record<string, unknown> = {
    status: active ? 'active' : 'cancelled',
    billing_source: 'apple',
    iap_original_transaction_id: txn.originalTransactionId,
    iap_product_id: txn.productId,
    iap_expires_at: expiresAt ? expiresAt.toISOString() : null,
  };
  if (active && tier) {
    update.plan_tier = tier;
  }
  // On lapse/refund, drop the tier so entitlements fall back to trial limits.
  if (!active) update.plan_tier = null;

  const { error } = await service.from('firms').update(update).eq('id', firmId);

  if (error) return { applied: false, reason: error.message };
  return { applied: true };
}
