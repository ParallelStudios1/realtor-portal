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
async function verifyWithServer(signedTransaction: string): Promise<boolean> {
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
      body: JSON.stringify({ signedTransaction }),
    });
    const body = await res.text();
    if (!res.ok) {
      lastVerifyError = `Server ${res.status}: ${body.slice(0, 140)}`;
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
 * Buy a subscription. Resolves true once our server confirms the entitlement.
 * Throws on StoreKit errors; the caller silences user-cancellation.
 */
export async function purchase(productId: string): Promise<boolean> {
  const m = await mod();
  if (!m) throw new Error('In-app purchase is not available on this device.');
  await initIap();

  const result = await m.requestPurchase({
    request: { apple: { sku: productId } },
    type: 'subs',
  });

  const purchases = Array.isArray(result) ? result : result ? [result] : [];
  for (const p of purchases) {
    const signed = signedFrom(p);
    if (!signed) continue;
    const ok = await verifyWithServer(signed);
    if (ok) {
      // Tell StoreKit we delivered the content, or Apple re-prompts forever.
      try {
        await m.finishTransaction({ purchase: p, isConsumable: false });
      } catch {}
      return true;
    }
  }
  return false;
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
    const purchases = await m.getAvailablePurchases({
      onlyIncludeActiveItemsIOS: true,
    });
    for (const p of Array.isArray(purchases) ? purchases : []) {
      const signed = signedFrom(p);
      if (!signed) continue;
      if (await verifyWithServer(signed)) return true;
    }
    return false;
  } catch (err) {
    console.warn('[iap] restore failed', err);
    return false;
  }
}
