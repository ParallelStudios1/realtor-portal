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

/**
 * Decode the renewal info that rides along with a server notification.
 *
 * This is where Apple tells us about a SCHEDULED plan change. When someone
 * switches to a cheaper plan, Apple keeps them on what they paid for until the
 * period ends, so the transaction still says "Brokerage" while
 * autoRenewProductId already says "Team". Without reading this, the app can
 * only ever show the current plan and a user who just requested a switch is
 * told, wrongly, that nothing happened.
 *
 * Returns null when the payload carries no renewal info (plain transactions).
 */
export async function decodeRenewalInfo(
  decodedNotification: any
): Promise<{ autoRenewProductId?: string; renewalDate?: number; autoRenewStatus?: number } | null> {
  const signed = decodedNotification?.data?.signedRenewalInfo;
  if (!signed || typeof signed !== 'string') return null;
  try {
    // The renewal info is itself a JWS. Its payload is the middle segment;
    // it arrived inside a notification we already verified against Apple's
    // root CAs, so the envelope is authenticated.
    const [, payload] = signed.split('.');
    if (!payload) return null;
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    );
    return {
      autoRenewProductId: json?.autoRenewProductId,
      renewalDate: json?.renewalDate,
      autoRenewStatus: json?.autoRenewStatus,
    };
  } catch (err) {
    console.error('[appleIap] could not decode renewal info', err);
    return null;
  }
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
    /** Apple's scheduled next plan, when it differs from the active one. */
    renewal?: {
      autoRenewProductId?: string;
      renewalDate?: number;
      autoRenewStatus?: number;
    } | null;
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

  // Staleness guard. Transactions do not arrive in order: StoreKit re-delivers
  // unfinished ones, and notifications can land late. Without this, an old
  // Starter transaction showing up after a Team purchase would silently
  // downgrade a paying customer. If the firm already holds an Apple
  // entitlement that outlasts this transaction, this one is history — record
  // it for audit, but don't let it rewrite the current plan.
  {
    const { data: current } = await service
      .from('firms')
      .select('iap_expires_at, iap_original_transaction_id, iap_product_id')
      .eq('id', firmId)
      .maybeSingle();
    const currentExpiry = (current as any)?.iap_expires_at
      ? new Date((current as any).iap_expires_at).getTime()
      : null;
    const incomingExpiry = expiresAt ? expiresAt.getTime() : null;
    const sameSubscription =
      (current as any)?.iap_original_transaction_id ===
      txn.originalTransactionId;

    if (
      currentExpiry !== null &&
      incomingExpiry !== null &&
      incomingExpiry < currentExpiry &&
      currentExpiry > Date.now() &&
      !(sameSubscription && revoked)
    ) {
      console.warn(
        '[appleIap] ignoring stale transaction',
        txn.productId,
        'expires',
        expiresAt?.toISOString(),
        '— firm already entitled through',
        (current as any).iap_expires_at
      );
      return { applied: false, reason: 'stale' };
    }
  }

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

  // Scheduled plan change. Apple applies upgrades immediately but defers
  // downgrades and crossgrades to the end of the paid period, so
  // autoRenewProductId can differ from what the customer is entitled to right
  // now. Record it so the app can say "switching to Team on Aug 1" instead of
  // looking like the change silently failed.
  const pendingProductId = args.renewal?.autoRenewProductId;
  if (pendingProductId && pendingProductId !== txn.productId) {
    update.iap_pending_product_id = pendingProductId;
    update.iap_pending_starts_at = args.renewal?.renewalDate
      ? new Date(args.renewal.renewalDate).toISOString()
      : expiresAt
        ? expiresAt.toISOString()
        : null;
  } else if (args.renewal) {
    // Same product (or the change was reverted) → nothing pending.
    update.iap_pending_product_id = null;
    update.iap_pending_starts_at = null;
  }
  if (args.renewal?.autoRenewStatus === 0) {
    // Auto-renew off: there is no next plan, it just ends.
    update.iap_auto_renew = false;
    update.iap_pending_product_id = null;
    update.iap_pending_starts_at = null;
  } else if (args.renewal?.autoRenewStatus === 1) {
    update.iap_auto_renew = true;
  }
  // Note: a transaction with no renewal info (the direct verify path) must
  // leave the pending columns alone. Clearing them there would wipe a
  // scheduled change that a notification legitimately recorded.

  const { error } = await service.from('firms').update(update).eq('id', firmId);

  if (error) return { applied: false, reason: error.message };
  return { applied: true };
}
