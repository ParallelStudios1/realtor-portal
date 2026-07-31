import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

/**
 * Apple In-App Purchase (StoreKit 2) helper — built against expo-iap v5.
 *
 * Required by App Store guideline 3.1.1: on iOS the subscription must be
 * purchasable inside the app. Android/web continue to use the existing Stripe
 * billing page, which Google and the web both permit.
 *
 * v5 API surface (OpenIAP): fetchProducts / requestPurchase / finishTransaction
 * / getAvailablePurchases / initConnection / endConnection. Older names like
 * getSubscriptions and getProducts do NOT exist in v5.
 *
 * The server is the source of truth — after StoreKit reports a purchase we hand
 * the signed transaction to /api/iap/apple/verify, which validates the
 * signature and flips firms.status to 'active'.
 */

/**
 * Auto-renewing subscription product IDs, as configured in App Store Connect
 * (subscription group "Realtor Portal Plans"). Monthly only — annual is not
 * offered through Apple.
 */
export const IAP_PRODUCT_IDS = [
  'com.parallelstudios.realtorportal.starter.monthly', // $99.99
  'com.parallelstudios.realtorportal.teamplan.monthly', // $299.99
  'com.parallelstudios.realtorportal.brokerage.monthly', // $799.99
] as const;

export type IapProduct = {
  id: string;
  title: string;
  description: string;
  displayPrice: string;
};

export const iapAvailable = Platform.OS === 'ios';

/** Lazy import so Android/Expo Go never touch the native module. */
async function mod(): Promise<any | null> {
  if (!iapAvailable) return null;
  try {
    return await import('expo-iap');
  } catch (err) {
    console.warn('[iap] expo-iap unavailable', err);
    return null;
  }
}

let connected = false;

export async function initIap(): Promise<boolean> {
  const m = await mod();
  if (!m) return false;
  if (connected) return true;
  try {
    await m.initConnection();
    connected = true;
    return true;
  } catch (err) {
    console.warn('[iap] initConnection failed', err);
    return false;
  }
}

export async function endIap(): Promise<void> {
  const m = await mod();
  if (!m || !connected) return;
  try {
    await m.endConnection();
  } catch {}
  connected = false;
}

/**
 * Fetch the subscription products with their localized App Store prices.
 * Returns [] when StoreKit has nothing for us — which on a real device almost
 * always means the products aren't in a fetchable state in App Store Connect
 * yet (they must be at least "Ready to Submit"), or the bundle id/agreement
 * doesn't match.
 */
export async function getProducts(): Promise<IapProduct[]> {
  const m = await mod();
  if (!m) return [];
  try {
    await initIap();
    const raw = await m.fetchProducts({
      skus: [...IAP_PRODUCT_IDS],
      type: 'subs',
    });
    const list = Array.isArray(raw) ? raw : [];
    if (list.length === 0) {
      console.warn(
        '[iap] fetchProducts returned 0 products for',
        IAP_PRODUCT_IDS.join(', ')
      );
    }
    return list
      .filter((p: any) => p && (p.id || p.productId))
      .map((p: any) => ({
        id: p.id || p.productId,
        title: p.displayName || p.title || 'Realtor Portal',
        description: p.description || '',
        displayPrice: p.displayPrice || '',
      }));
  } catch (err) {
    console.warn('[iap] fetchProducts failed', err);
    return [];
  }
}

/** Last server-side failure reason, surfaced to the UI for diagnosis. */
let lastVerifyError: string | null = null;

export function getLastVerifyError(): string | null {
  return lastVerifyError;
}

/**
 * Send a StoreKit signed transaction to our server for verification.
 * Records why it failed so the paywall can say something more useful than
 * "could not be confirmed".
 */
async function verifyWithServer(
  signedTransaction: string,
  expectedProductId?: string
): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    lastVerifyError = 'You are signed out. Sign in and tap Restore Purchases.';
    return false;
  }
  const base =
    process.env.EXPO_PUBLIC_API_URL || 'https://realtorportal.parallelstudios.co';
  try {
    const res = await fetch(base + '/api/iap/apple/verify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + token,
      },
      // Declaring the plan the user tapped lets the server reject a mismatched
      // transaction instead of quietly granting the wrong plan.
      body: JSON.stringify({ signedTransaction, expectedProductId }),
    });
    const body = await res.text();
    if (!res.ok) {
      lastVerifyError =
        res.status === 409 && body.includes('product_mismatch')
          ? 'Apple returned a different plan than the one you selected. Nothing was changed — please try again.'
          : `Server ${res.status}: ${body.slice(0, 140)}`;
      console.warn('[iap] verify rejected', res.status, body);
      return false;
    }
    const json = JSON.parse(body || '{}');
    if (!json?.active) {
      lastVerifyError = `Server did not activate: ${body.slice(0, 140)}`;
      return false;
    }
    lastVerifyError = null;
    return true;
  } catch (err: any) {
    lastVerifyError = 'Network error reaching the server.';
    console.warn('[iap] verify network error', err);
    return false;
  }
}

/** Pull the signed JWS off a purchase, whichever field carries it. */
function signedFrom(purchase: any): string | null {
  return (
    purchase?.jwsRepresentation ||
    purchase?.jwsRepresentationIOS ||
    purchase?.purchaseToken ||
    null
  );
}

/**
 * The SKU a purchase refers to. expo-iap is inconsistent about the field name
 * across platforms and shapes, so check every one it uses — reading only
 * `productId` would make the matching below silently fail.
 */
function skuOf(purchase: any): string | null {
  return purchase?.productId || purchase?.id || purchase?.sku || null;
}

export type PurchaseResult =
  /** Entitlement is live now — server confirmed it. */
  | { status: 'active' }
  /**
   * Apple accepted the change but it starts at the next renewal. This is the
   * normal, correct outcome when moving to a cheaper plan; the customer keeps
   * what they paid for until then.
   */
  | { status: 'scheduled'; currentProductId: string | null; startsAt: Date | null }
  /** Nothing happened — surface getLastVerifyError(). */
  | { status: 'failed' };

/**
 * Look for a plan change that Apple scheduled instead of applying now.
 *
 * After a deferred switch, getAvailablePurchases still reports the CURRENT
 * entitlement (the plan they paid for), and the requested product simply has no
 * transaction yet. Seeing an active subscription for a *different* product in
 * the same group is how we know the switch was accepted rather than lost.
 */
async function detectScheduledChange(
  m: any,
  requestedProductId: string
): Promise<{ currentProductId: string | null; startsAt: Date | null } | null> {
  try {
    const raw = await m.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
    const active = (Array.isArray(raw) ? raw : []).filter((p: any) =>
      (IAP_PRODUCT_IDS as readonly string[]).includes(skuOf(p) || '')
    );
    if (active.length === 0) return null;
    const current = active.find((p: any) => skuOf(p) !== requestedProductId);
    if (!current) return null;
    const expiry =
      current?.expirationDateIOS ?? current?.expirationDate ?? null;
    return {
      currentProductId: skuOf(current),
      startsAt: expiry ? new Date(Number(expiry)) : null,
    };
  } catch (err) {
    console.warn('[iap] detectScheduledChange failed', err);
    return null;
  }
}

/**
 * Buy a subscription. Resolves once StoreKit and our server have settled.
 * Throws on StoreKit errors; the caller silences user-cancellation.
 */
export async function purchase(productId: string): Promise<PurchaseResult> {
  const m = await mod();
  if (!m) throw new Error('In-app purchase is not available on this device.');
  await initIap();

  // Clear anything stranded in the queue first. StoreKit re-delivers unfinished
  // transactions alongside new ones, so a purchase that previously failed
  // server verification would otherwise come back and be mistaken for this one.
  await flushStaleTransactions(m, productId);

  const result = await m.requestPurchase({
    request: { apple: { sku: productId } },
    type: 'subs',
  });

  const purchases = Array.isArray(result) ? result : result ? [result] : [];

  // Only ever act on the transaction for the product the user actually chose.
  // Verifying "the first one with a signature" is how buying Team could grant
  // Starter: a stale Starter transaction was still queued and arrived first.
  const candidates = purchases.filter((p: any) => skuOf(p) === productId);

  if (candidates.length === 0) {
    // NOT necessarily a failure. Apple applies upgrades immediately but defers
    // downgrades and crossgrades to the end of the period already paid for, and
    // issues no new transaction now. Telling the user this failed — and to tap
    // Restore, which can never help — is wrong and confusing.
    const scheduled = await detectScheduledChange(m, productId);
    if (scheduled) {
      lastVerifyError = null;
      return { status: 'scheduled', ...scheduled };
    }
    console.warn(
      '[iap] no transaction returned for',
      productId,
      'got:',
      purchases.map((p: any) => skuOf(p)).join(', ') || 'none'
    );
    lastVerifyError =
      'Apple did not confirm the purchase. If you were charged, tap Restore Purchases.';
    return { status: 'failed' };
  }

  for (const p of candidates) {
    const signed = signedFrom(p);
    if (!signed) continue;
    const ok = await verifyWithServer(signed, productId);
    if (ok) {
      // Tell StoreKit we delivered the content, or Apple re-prompts forever.
      try {
        await m.finishTransaction({ purchase: p, isConsumable: false });
      } catch {}
      return { status: 'active' };
    }
  }
  return { status: 'failed' };
}

/**
 * Verify-and-finish any unfinished transactions still sitting in the queue.
 *
 * These accumulate whenever a purchase succeeded at Apple but failed our
 * server verification. Left alone they get re-delivered on every subsequent
 * purchase and can be mistaken for the new one. We skip the product being
 * bought right now so we never race the live purchase.
 */
async function flushStaleTransactions(m: any, skipProductId?: string): Promise<void> {
  try {
    const pending = await m.getAvailablePurchases({
      onlyIncludeActiveItemsIOS: false,
    });
    for (const p of Array.isArray(pending) ? pending : []) {
      if (skipProductId && skuOf(p) === skipProductId) continue;
      if (!signedFrom(p)) continue;
      // Deliberately NOT verified here. Sending these to the server would let a
      // months-old Starter transaction overwrite the plan the user is buying
      // right now. Just clear them from the queue — getAvailablePurchases still
      // reports live entitlements afterwards, so Restore Purchases can recover
      // anything that genuinely never got applied.
      try {
        await m.finishTransaction({ purchase: p, isConsumable: false });
      } catch {}
    }
  } catch (err) {
    console.warn('[iap] flushStaleTransactions failed', err);
  }
}

/**
 * Open Apple's subscription management screen, where the user can upgrade,
 * downgrade, or cancel. Apple does not allow an app to cancel a subscription
 * directly — deep-linking here is the sanctioned (and required) path.
 */
export async function manageSubscriptions(): Promise<boolean> {
  const m = await mod();
  if (!m?.deepLinkToSubscriptions) return false;
  try {
    await initIap();
    await m.deepLinkToSubscriptions();
    return true;
  } catch (err) {
    console.warn('[iap] deepLinkToSubscriptions failed', err);
    return false;
  }
}

/**
 * Restore purchases — required by Apple for any app with a subscription.
 * Re-verifies every active entitlement against our server.
 */
export async function restore(): Promise<boolean> {
  const m = await mod();
  if (!m) return false;
  try {
    await initIap();
    const raw = await m.getAvailablePurchases({
      onlyIncludeActiveItemsIOS: true,
    });
    const purchases = (Array.isArray(raw) ? raw : []).filter((p: any) =>
      signedFrom(p)
    );
    if (purchases.length === 0) return false;

    // Restore the CURRENT subscription, not whichever happens to be first.
    // Someone who upgraded Starter -> Team has both in history; sorting by
    // transaction date means the newest (their real plan) wins.
    purchases.sort(
      (a: any, b: any) => (b?.transactionDate ?? 0) - (a?.transactionDate ?? 0)
    );

    let restored = false;
    for (const p of purchases) {
      const signed = signedFrom(p);
      if (!signed) continue;
      if (!restored) {
        // Newest first: this one defines the active plan.
        restored = await verifyWithServer(signed);
        if (restored) {
          try {
            await m.finishTransaction({ purchase: p, isConsumable: false });
          } catch {}
          continue;
        }
      }
      // Clear the older ones so they can't be replayed as the "current" plan.
      try {
        await m.finishTransaction({ purchase: p, isConsumable: false });
      } catch {}
    }
    return restored;
  } catch (err) {
    console.warn('[iap] restore failed', err);
    return false;
  }
}
